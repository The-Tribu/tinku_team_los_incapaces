/**
 * Pulls real plants/stations from the hackathon middleware (Growatt + Deye)
 * and upserts them as SunHub plants with real devices ready for ingest.
 *
 * Usage:
 *   npm run plants:sync
 *
 * Exports `syncRealPlants()` so the cron worker can reuse it.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || m[1].startsWith("#")) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

import { prisma } from "../src/lib/prisma";
import { mw } from "../src/lib/middleware";
import { providers, type CanonicalPlant } from "../src/lib/normalize";

// TTL largo (15 min) para inventario — plantas cambian rara vez y recortamos
// llamadas repetidas cuando el cron hace plants-sync cada hora.
const PLANTS_TTL_SEC = 15 * 60;

// Límites defensivos para las iteraciones paginadas de Growatt.
const GROWATT_CUSERS_PERPAGE = 100;
const GROWATT_CUSERS_MAX_PAGES = 20;
const GROWATT_PLANTS_PERPAGE = 10;
const GROWATT_PLANTS_MAX_PAGES = 50;

async function fetchDeye() {
  const res = await mw<{ stationList?: unknown[] }>(
    "/deye/v1.0/station/list",
    { method: "POST", body: JSON.stringify({ page: 1, size: 50 }) },
    { cacheTtlSec: PLANTS_TTL_SEC },
  );
  return providers.deye.plantsList(res);
}

type GrowattCUser = {
  c_user_id?: number | string;
  id?: number | string;
  user_id?: number | string;
};

// Growatt documenta c_user_list / plant/list bajo distintas envolturas según la
// versión del middleware. Extraemos ids buscando en las rutas conocidas.
function extractGrowattCUserIds(resp: unknown): number[] {
  if (!resp || typeof resp !== "object") return [];
  const root = resp as {
    data?:
      | GrowattCUser[]
      | {
          c_user?: GrowattCUser[];
          c_users?: GrowattCUser[];
          list?: GrowattCUser[];
          users?: GrowattCUser[];
        };
    c_user?: GrowattCUser[];
    c_users?: GrowattCUser[];
  };
  const candidates: GrowattCUser[] = Array.isArray(root.data)
    ? root.data
    : (root.data?.c_user ??
        root.data?.c_users ??
        root.data?.list ??
        root.data?.users ??
        root.c_user ??
        root.c_users ??
        []);
  const ids: number[] = [];
  for (const u of candidates) {
    const raw = u?.c_user_id ?? u?.id ?? u?.user_id;
    const id = typeof raw === "number" ? raw : Number(raw);
    if (Number.isFinite(id)) ids.push(id);
  }
  return [...new Set(ids)];
}

async function fetchGrowattCUserIds(): Promise<number[]> {
  const all: number[] = [];
  for (let page = 1; page <= GROWATT_CUSERS_MAX_PAGES; page++) {
    try {
      const res = await mw<unknown>(
        `/growatt/v1/user/c_user_list?page=${page}&perpage=${GROWATT_CUSERS_PERPAGE}`,
        { method: "GET" },
        { cacheTtlSec: PLANTS_TTL_SEC },
      );
      const ids = extractGrowattCUserIds(res);
      if (ids.length === 0) break;
      all.push(...ids);
      if (ids.length < GROWATT_CUSERS_PERPAGE) break;
    } catch (err) {
      console.warn(
        `[growatt] c_user_list page=${page} failed: ${(err as Error).message.slice(0, 120)}`,
      );
      break;
    }
  }
  return [...new Set(all)];
}

async function fetchGrowattPlantsForCUser(cUserId: number): Promise<CanonicalPlant[]> {
  const plants: CanonicalPlant[] = [];
  for (let page = 1; page <= GROWATT_PLANTS_MAX_PAGES; page++) {
    try {
      const res = await mw<unknown>(
        `/growatt/v1/plant/list?c_user_id=${cUserId}&page=${page}&perpage=${GROWATT_PLANTS_PERPAGE}`,
        { method: "GET" },
        { cacheTtlSec: PLANTS_TTL_SEC },
      );
      const pagePlants = providers.growatt.plantsList(res);
      if (pagePlants.length === 0) break;
      plants.push(...pagePlants);
      if (pagePlants.length < GROWATT_PLANTS_PERPAGE) break;
    } catch (err) {
      console.warn(
        `[growatt] plant/list c_user_id=${cUserId} page=${page} failed: ${(err as Error).message.slice(0, 120)}`,
      );
      break;
    }
  }
  return plants;
}

async function fetchGrowatt(): Promise<CanonicalPlant[]> {
  const cUserIds = await fetchGrowattCUserIds();
  if (cUserIds.length === 0) {
    console.warn("[growatt] c_user_list vacío — usando fallback Bavaria Tibitó");
    try {
      const data = await mw<{ data?: { peak_power_actual?: number } }>(
        "/growatt/v1/plant/data?plant_id=1356131",
        undefined,
        { cacheTtlSec: PLANTS_TTL_SEC },
      );
      return [
        {
          external_id: "1356131",
          name: "Planta Bavaria Tibitó",
          location: "Cundinamarca, Colombia",
          lat: 5.02,
          lng: -73.95,
          capacity_kwp: Number(data?.data?.peak_power_actual ?? 50),
        },
      ];
    } catch (err) {
      console.warn(`[growatt] plant/data fallback failed: ${(err as Error).message.slice(0, 120)}`);
      return [];
    }
  }

  console.log(`[growatt] c_users=${cUserIds.length} — iterando plant/list por usuario`);
  const seen = new Set<string>();
  const out: CanonicalPlant[] = [];
  for (const uid of cUserIds) {
    const plants = await fetchGrowattPlantsForCUser(uid);
    for (const p of plants) {
      if (seen.has(p.external_id)) continue;
      seen.add(p.external_id);
      out.push(p);
    }
  }
  return out;
}

/**
 * Pull Huawei FusionSolar stations via el endpoint v2 `/thirdData/stations`
 * (paginado, capacity en kW). Si el upstream rate-limita (failCode=407) el
 * middleware ya reintenta — acá sólo tragamos el error y devolvemos vacío
 * para no bloquear el resto del sync.
 */
async function fetchHuawei() {
  try {
    const res = await mw<unknown>(
      "/huawei/thirdData/stations",
      { method: "POST", body: JSON.stringify({ pageNo: 1 }) },
      { cacheTtlSec: PLANTS_TTL_SEC },
    );
    return providers.huawei.plantsList(res);
  } catch (err) {
    console.warn(`[huawei] stations failed: ${(err as Error).message.slice(0, 120)}`);
    return [];
  }
}

async function upsertProvider(slug: "deye" | "growatt" | "huawei", displayName: string) {
  const existing = await prisma.provider.findUnique({ where: { slug } });
  return existing ?? prisma.provider.create({ data: { slug, displayName } });
}

export async function syncRealPlants() {
  const started = Date.now();
  console.log("[plants-sync] middleware:", process.env.MIDDLEWARE_BASE_URL);
  const [deyeProvider, growattProvider, huaweiProvider] = await Promise.all([
    upsertProvider("deye", "DeyeCloud"),
    upsertProvider("growatt", "Growatt"),
    upsertProvider("huawei", "Huawei FusionSolar"),
  ]);
  const [deyeStations, growattPlants, huaweiPlants] = await Promise.all([
    fetchDeye(),
    fetchGrowatt(),
    fetchHuawei(),
  ]);
  console.log(
    `[plants-sync] Deye → ${deyeStations.length} stations · Growatt → ${growattPlants.length} plants · Huawei → ${huaweiPlants.length} stations`,
  );

  let client = await prisma.client.findFirst({ where: { name: "Techos Rentables (real)" } });
  if (!client) {
    client = await prisma.client.create({
      data: { name: "Techos Rentables (real)", region: "Colombia" },
    });
  }

  const plan: Array<{
    providerId: string;
    slug: string;
    externalId: string;
    name: string;
    lat?: number;
    lng?: number;
    capacityKwp?: number;
    location?: string;
  }> = [
    ...deyeStations.map((s) => ({
      providerId: deyeProvider.id,
      slug: "deye",
      externalId: s.external_id,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      capacityKwp: s.capacity_kwp,
      location: s.location,
    })),
    ...growattPlants.map((p) => ({
      providerId: growattProvider.id,
      slug: "growatt",
      externalId: p.external_id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      capacityKwp: p.capacity_kwp,
      location: p.location,
    })),
    ...huaweiPlants.map((p) => ({
      providerId: huaweiProvider.id,
      slug: "huawei",
      externalId: p.external_id,
      name: p.name,
      lat: p.lat,
      lng: p.lng,
      capacityKwp: p.capacity_kwp,
      location: p.location,
    })),
  ];

  let created = 0;
  let updated = 0;
  for (const row of plan) {
    const code = `RE-${row.slug.slice(0, 3).toUpperCase()}-${row.externalId}`;
    let plant = await prisma.plant.findUnique({ where: { code } });
    if (!plant) {
      plant = await prisma.plant.create({
        data: {
          clientId: client.id,
          code,
          name: row.name,
          location: row.location ?? null,
          lat: row.lat ?? null,
          lng: row.lng ?? null,
          capacityKwp: row.capacityKwp ?? null,
          contractType: "real",
        },
      });
      created++;
    } else {
      await prisma.plant.update({
        where: { id: plant.id },
        data: {
          name: row.name,
          location: row.location ?? null,
          lat: row.lat ?? null,
          lng: row.lng ?? null,
          capacityKwp: row.capacityKwp ?? null,
        },
      });
      updated++;
    }
    const device = await prisma.device.findUnique({
      where: { providerId_externalId: { providerId: row.providerId, externalId: row.externalId } },
    });
    if (!device) {
      await prisma.device.create({
        data: {
          plantId: plant.id,
          providerId: row.providerId,
          externalId: row.externalId,
          kind: "inverter",
          currentStatus: "offline",
        },
      });
    }
  }

  const dur = Date.now() - started;
  console.log(`[plants-sync] done · created=${created} updated=${updated} · ${dur}ms`);
  return { created, updated, total: plan.length };
}

// CLI mode
if (import.meta.url === `file://${process.argv[1]}`) {
  syncRealPlants()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
