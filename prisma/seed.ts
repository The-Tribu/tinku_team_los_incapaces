#!/usr/bin/env tsx
/**
 * SunHub seed.
 *
 * Creates providers (growatt, deye) and a realistic fleet that matches the
 * mockups: ~8 plants across several Colombian clients, with a mix of
 * online / warning / offline states so the dashboard demo looks alive.
 *
 * The single "real" plant is Growatt plant_id 1356131 (confirmed live via the
 * sandbox middleware). The rest are fixtures used for UI demos.
 *
 * Run with: npm run db:seed
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(file: string) {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, rawV] = m;
      if (process.env[k]) continue;
      process.env[k] = rawV.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  } catch {}
}

loadDotEnv(".env.local");
loadDotEnv(".env");

import { prisma } from "../src/lib/prisma";

type PlantSeed = {
  code: string;
  name: string;
  client: string;
  region: string;
  lat: number;
  lng: number;
  capacityKwp: number;
  provider: "growatt" | "deye";
  externalId: string;
  status: "online" | "warning" | "offline" | "degraded";
  contractType: "PPA" | "Leasing" | "Compra";
};

const PLANTS: PlantSeed[] = [
  // Real plant from the hackathon sandbox (Growatt plant_id 1356131)
  {
    code: "TR-0201",
    name: "Planta Tibitó",
    client: "Bavaria",
    region: "Cundinamarca",
    lat: 5.02,
    lng: -73.95,
    capacityKwp: 50,
    provider: "growatt",
    externalId: "1356131",
    status: "online",
    contractType: "PPA",
  },
  // Demo fixtures for the dashboard
  {
    code: "TR-0102",
    name: "Planta Éxito Envigado",
    client: "Éxito",
    region: "Antioquia",
    lat: 6.17,
    lng: -75.58,
    capacityKwp: 420,
    provider: "growatt",
    externalId: "1356132",
    status: "online",
    contractType: "Leasing",
  },
  {
    code: "TR-0103",
    name: "Planta Alpina Sopó",
    client: "Alpina",
    region: "Cundinamarca",
    lat: 4.91,
    lng: -73.93,
    capacityKwp: 280,
    provider: "growatt",
    externalId: "1356133",
    status: "warning",
    contractType: "PPA",
  },
  {
    code: "TR-0204",
    name: "Planta Olímpica Barranquilla",
    client: "Olímpica",
    region: "Atlántico",
    lat: 10.96,
    lng: -74.79,
    capacityKwp: 350,
    provider: "deye",
    externalId: "D-BAQ-01",
    status: "offline",
    contractType: "PPA",
  },
  {
    code: "TR-0205",
    name: "Planta Postobón Yumbo",
    client: "Postobón",
    region: "Valle",
    lat: 3.55,
    lng: -76.49,
    capacityKwp: 520,
    provider: "deye",
    externalId: "D-YMB-01",
    status: "online",
    contractType: "Compra",
  },
  {
    code: "TR-0206",
    name: "Planta Nutresa Medellín",
    client: "Nutresa",
    region: "Antioquia",
    lat: 6.25,
    lng: -75.56,
    capacityKwp: 690,
    provider: "growatt",
    externalId: "1356136",
    status: "online",
    contractType: "PPA",
  },
  {
    code: "TR-0207",
    name: "Planta Corona Sopó",
    client: "Corona",
    region: "Cundinamarca",
    lat: 4.91,
    lng: -73.95,
    capacityKwp: 210,
    provider: "growatt",
    externalId: "1356137",
    status: "degraded",
    contractType: "Leasing",
  },
  {
    code: "TR-0208",
    name: "Planta Familia Cali",
    client: "Familia",
    region: "Valle",
    lat: 3.45,
    lng: -76.53,
    capacityKwp: 180,
    provider: "deye",
    externalId: "D-CAL-01",
    status: "online",
    contractType: "PPA",
  },
];

async function main() {
  console.log("→ Seeding providers…");
  const growatt = await prisma.provider.upsert({
    where: { slug: "growatt" },
    create: { slug: "growatt", displayName: "Growatt", pollingMin: 5, enabled: true },
    update: { displayName: "Growatt", enabled: true },
  });
  const deye = await prisma.provider.upsert({
    where: { slug: "deye" },
    create: { slug: "deye", displayName: "DeyeCloud", pollingMin: 5, enabled: true },
    update: { displayName: "DeyeCloud", enabled: true },
  });
  const providerBySlug: Record<string, string> = {
    growatt: growatt.id,
    deye: deye.id,
  };

  console.log("→ Seeding clients + plants + devices…");
  const clientsByName = new Map<string, string>();
  for (const p of PLANTS) {
    if (!clientsByName.has(p.client)) {
      const existing = await prisma.client.findFirst({ where: { name: p.client } });
      const c =
        existing ??
        (await prisma.client.create({
          data: {
            name: p.client,
            region: p.region,
            contactEmail: `ops@${p.client.toLowerCase()}.co`,
          },
        }));
      clientsByName.set(p.client, c.id);
    }
    const clientId = clientsByName.get(p.client)!;

    const plant = await prisma.plant.upsert({
      where: { code: p.code },
      create: {
        clientId,
        code: p.code,
        name: p.name,
        location: `${p.region}, Colombia`,
        lat: p.lat,
        lng: p.lng,
        capacityKwp: p.capacityKwp,
        contractType: p.contractType,
      },
      update: {
        name: p.name,
        lat: p.lat,
        lng: p.lng,
        capacityKwp: p.capacityKwp,
        contractType: p.contractType,
      },
    });

    await prisma.device.upsert({
      where: {
        providerId_externalId: {
          providerId: providerBySlug[p.provider],
          externalId: p.externalId,
        },
      },
      create: {
        plantId: plant.id,
        providerId: providerBySlug[p.provider],
        externalId: p.externalId,
        kind: "inverter",
        model: p.provider === "growatt" ? "Growatt MIN-XH" : "Deye SUN-10K",
        installedAt: new Date("2024-09-01"),
        currentStatus: p.status,
        lastSeenAt: new Date(),
      },
      update: { currentStatus: p.status, lastSeenAt: new Date() },
    });

    // Current-month contract target for compliance scoring
    const periodMonth = new Date();
    periodMonth.setUTCDate(1);
    periodMonth.setUTCHours(0, 0, 0, 0);
    await prisma.contract.upsert({
      where: { plantId_periodMonth: { plantId: plant.id, periodMonth } },
      create: {
        plantId: plant.id,
        periodMonth,
        targetEnergyKwh: p.capacityKwp * 4.2 * 30, // Colombia avg ~4.2 kWh/kWp/day
        targetSavingsCop: p.capacityKwp * 4.2 * 30 * 680,
        targetUptimePct: 98.0,
        targetPrPct: 78.0,
        targetCo2Ton: (p.capacityKwp * 4.2 * 30 * 0.164) / 1000,
        penaltyPerBreach: 2_500_000,
      },
      update: {},
    });
  }

  console.log(`✓ ${PLANTS.length} plants seeded across ${clientsByName.size} clients.`);
  console.log(`  Real plant via middleware: Growatt plant_id=1356131 (Bavaria Tibitó)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
