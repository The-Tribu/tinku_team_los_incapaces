#!/usr/bin/env tsx
/**
 * Backfill synthetic readings for the last N hours so the dashboard's 24-hour
 * chart and the rules engine have something to chew on during demos.
 *
 * Usage:
 *   npm run ingest:backfill          # 24h, 5-min resolution
 *   npm run ingest:backfill 48 10    # 48h, 10-min resolution
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
import { syntheticReading } from "../src/lib/synthetic";

const HOURS = Number(process.argv[2] ?? 24);
const STEP_MIN = Number(process.argv[3] ?? 5);

async function main() {
  const devices = await prisma.device.findMany({ include: { plant: true } });
  if (devices.length === 0) {
    console.error("No devices in DB. Run `npm run db:seed` first.");
    process.exit(1);
  }

  const now = Date.now();
  const startMs = now - HOURS * 60 * 60 * 1000;
  const stepMs = STEP_MIN * 60 * 1000;
  const samples = Math.floor((now - startMs) / stepMs);

  console.log(
    `→ Backfilling ${devices.length} devices × ${samples} samples (${HOURS}h @ ${STEP_MIN}min)…`,
  );

  for (const d of devices) {
    const rows: any[] = [];
    for (let t = startMs; t <= now; t += stepMs) {
      const r = syntheticReading({
        externalId: d.externalId,
        capacityKwp: Number(d.plant.capacityKwp ?? 100),
        forcedStatus: d.currentStatus as never,
        now: new Date(t),
      });
      rows.push({
        deviceId: d.id,
        ts: new Date(t),
        powerAcKw: r.power_ac_kw,
        voltageV: r.voltage_v,
        currentA: r.current_a,
        frequencyHz: r.frequency_hz,
        powerFactor: r.power_factor,
        temperatureC: r.temperature_c,
        energyKwh: r.energy_kwh,
        raw: { synthetic: true },
      });
    }
    await prisma.reading.createMany({ data: rows });
    process.stdout.write(".");
  }
  console.log(`\n✓ Backfill complete.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
