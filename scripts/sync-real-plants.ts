/**
 * Pulls real plants/stations from the hackathon middleware (Growatt + Deye)
 * and upserts them as SunHub plants with real devices ready for ingest.
 *
 * Usage:
 *   npm run plants:sync
 *
 * What it does:
 *  1) Deye: POST /deye/v1.0/station/list  → 6 real Colombian stations
 *  2) Growatt: GET /growatt/v1/plant/list  (gracefully degrades if rate-limited)
 *     + probes plant_id=1356131 (Bavaria Tibitó) via plant/data
 *  3) Creates a "Real Clients" bucket per station, plant, and a single device row.
 *  4) Marks existing seed plants as synthetic so they can be filtered in the UI.
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

import { PrismaClient } from "@prisma/client";
import { mw } from "../src/lib/middleware";
import { providers } from "../src/lib/normalize";

const prisma = new PrismaClient();

async function fetchDeye() {
  const res = await mw<{ stationList?: unknown[] }>("/deye/v1.0/station/list", {
    method: "POST",
    body: JSON.stringify({ page: 1, size: 50 }),
  });
  return providers.deye.plantsList(res);
}

async function fetchGrowatt() {
  try {
    const res = await mw<unknown>("/growatt/v1/plant/list", { method: "GET" });
    const list = providers.growatt.plantsList(res);
    if (list.length > 0) return list;
  } catch (err) {
    console.warn(`[growatt] plant/list failed: ${(err as Error).message.slice(0, 120)}`);
  }
  // Rate-limited or encrypted. Fall back to the known Bavaria Tibitó plant.
  try {
    const data = await mw<{ data?: { peak_power_actual?: number } }>(
      "/growatt/v1/plant/data?plant_id=1356131",
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
    console.warn(`[growatt] plant/data failed: ${(err as Error).message.slice(0, 120)}`);
    return [];
  }
}

async function upsertProvider(slug: "deye" | "growatt", displayName: string) {
  const existing = await prisma.provider.findUnique({ where: { slug } });
  return existing ?? prisma.provider.create({ data: { slug, displayName } });
}

async function main() {
  console.log("→ Middleware base:", process.env.MIDDLEWARE_BASE_URL);
  const [deyeProvider, growattProvider] = await Promise.all([
    upsertProvider("deye", "DeyeCloud"),
    upsertProvider("growatt", "Growatt"),
  ]);
  const [deyeStations, growattPlants] = await Promise.all([fetchDeye(), fetchGrowatt()]);
  console.log(`Deye → ${deyeStations.length} stations`);
  console.log(`Growatt → ${growattPlants.length} plants`);

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
  ];

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
      console.log(`  + plant created ${code} · ${row.name}`);
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
      console.log(`  ~ plant refreshed ${code}`);
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
      console.log(`    + device ${row.externalId}`);
    }
  }

  const summary = await prisma.plant.groupBy({ by: ["contractType"], _count: true });
  console.log("\nPlantas por tipo:", summary);
  await prisma.$disconnect();
}

main().catch(async (err) => {
  console.error(err);
  await prisma.$disconnect();
  process.exit(1);
});
