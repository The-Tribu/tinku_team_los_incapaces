#!/usr/bin/env tsx
/**
 * Diagnóstico: muestra lecturas reales en BD para dispositivos DEMO-DEY-*
 * y compara con lo que simulateReading() produciría ahora mismo.
 *
 * Ejecutar: npx tsx scripts/diagnose-deye.ts
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
  } catch { /* optional */ }
}
loadDotEnv(".env.local");
loadDotEnv(".env");

import { prisma } from "../src/lib/prisma";
import { DEMO_STATIONS, simulateReading } from "../src/lib/deye-sim";

async function main() {
  console.log("=== DIAGNÓSTICO DEYE DEMO ===\n");

  const provider = await prisma.provider.findUnique({ where: { slug: "deye_demo" } });
  if (!provider) {
    console.log("❌  Provider 'deye_demo' NO existe en DB. Corre: npm run scrape:deye -- --once");
    return;
  }
  console.log(`✅  Provider: ${provider.slug} (${provider.id})\n`);

  for (const station of DEMO_STATIONS) {
    console.log(`─── ${station.id} · ${station.name}`);

    const device = await prisma.device.findFirst({
      where: { providerId: provider.id, externalId: station.id },
      include: {
        plant: { select: { name: true, location: true, lat: true, lng: true, client: { select: { name: true, region: true } } } },
        readings: { take: 3, orderBy: { ts: "desc" } },
      },
    });

    if (!device) {
      console.log("  ❌  Device NO encontrado en DB\n");
      continue;
    }

    console.log(`  Device ID : ${device.id}`);
    console.log(`  Status    : ${device.currentStatus}`);
    console.log(`  LastSeen  : ${device.lastSeenAt?.toISOString() ?? "nunca"}`);
    console.log(`  Planta    : ${device.plant?.name} · ${device.plant?.client?.name} · ${device.plant?.client?.region}`);
    console.log(`  Coords    : lat=${device.plant?.lat} lng=${device.plant?.lng}`);
    console.log(`  Readings  : ${device.readings.length} en DB`);

    if (device.readings.length === 0) {
      console.log("  ⚠️   Sin lecturas — el scraper aún no ha persistido ninguna");
    }
    for (const r of device.readings) {
      console.log(
        `    ts=${r.ts.toISOString()}  ` +
        `power=${r.powerAcKw ?? "NULL"}  ` +
        `voltage=${r.voltageV ?? "NULL"}  ` +
        `temp=${r.temperatureC ?? "NULL"}  ` +
        `energy=${r.energyKwh ?? "NULL"}`
      );
    }

    // Compare with what simulateReading would produce right now
    const sim = simulateReading(station);
    console.log(`  Simulación ahora: power=${sim.power_ac_kw.toFixed(3)} kW · status=${sim.status} · energy=${sim.energy_kwh.toFixed(2)} kWh`);
    console.log();
  }

  await prisma.$disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
