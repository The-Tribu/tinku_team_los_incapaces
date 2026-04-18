#!/usr/bin/env tsx
/**
 * Ingestion tick — pulls readings from the middleware for every device in
 * the DB and persists them to Postgres. Only real data from the provider
 * is stored; if a provider response is unparseable, the reading is skipped.
 *
 * Usage:
 *   npm run ingest           # run a single tick (one-shot)
 *   npm run cron             # schedule this tick on a recurring cron
 *
 * This module exports `tick()` so the cron worker can reuse it without
 * spawning a subprocess.
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
  } catch {
    /* file optional */
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

import { prisma } from "../lib/prisma";
import { mw, MiddlewareError } from "../lib/middleware";
import { providers, type ProviderSlug, type CanonicalReading } from "../lib/normalize";
import { readingEndpoint } from "../lib/providers";
import { evaluateRules } from "../lib/rules";

async function fetchReading(
  slug: ProviderSlug,
  externalId: string,
): Promise<CanonicalReading | null> {
  const ep = readingEndpoint(slug, externalId);
  const init: RequestInit = { method: ep.method };
  if (ep.body !== undefined) init.body = JSON.stringify(ep.body);
  try {
    const raw = await mw(ep.path, init);
    const adapter = providers[slug];
    if (!adapter) return null;
    const reading = adapter.plantReading(externalId, raw as never);
    if (!reading && process.env.INGEST_DEBUG) {
      const preview =
        typeof raw === "string" ? raw.slice(0, 120) : JSON.stringify(raw).slice(0, 180);
      console.warn(`[ingest] ${slug}/${externalId} → unparseable: ${preview}`);
    }
    return reading;
  } catch (err) {
    if (err instanceof MiddlewareError) {
      console.warn(`[ingest] ${slug}/${externalId} → ${err.status}: ${err.body.slice(0, 100)}`);
    } else {
      console.warn(`[ingest] ${slug}/${externalId} → ${(err as Error).message}`);
    }
    return null;
  }
}

type DeviceRow = { id: string };
async function persist(device: DeviceRow, reading: CanonicalReading) {
  await prisma.$transaction([
    prisma.reading.create({
      data: {
        deviceId: device.id,
        ts: new Date(reading.ts),
        powerAcKw: reading.power_ac_kw,
        voltageV: reading.voltage_v,
        currentA: reading.current_a,
        frequencyHz: reading.frequency_hz,
        powerFactor: reading.power_factor,
        temperatureC: reading.temperature_c,
        energyKwh: reading.energy_kwh,
        raw: reading as object,
      },
    }),
    prisma.device.update({
      where: { id: device.id },
      data: {
        currentStatus: reading.status,
        lastSeenAt: new Date(reading.ts),
      },
    }),
  ]);
}

export async function tick() {
  const started = Date.now();
  const devices = await prisma.device.findMany({
    include: { provider: true, plant: { select: { capacityKwp: true } } },
  });
  if (devices.length === 0) {
    console.log("[ingest] no devices in DB — run `make plants-sync` to pull real plants from the middleware");
    return { ok: 0, fail: 0, skipped: 0 };
  }

  let ok = 0;
  let fail = 0;
  let skipped = 0;
  for (const d of devices) {
    const slug = d.provider.slug as ProviderSlug;
    if (!(slug in providers)) {
      skipped++;
      continue;
    }
    const reading = await fetchReading(slug, d.externalId);
    if (!reading) {
      fail++;
      continue;
    }
    try {
      await persist(d as DeviceRow, reading);
      await evaluateRules(reading, {
        deviceId: d.id,
        plantCapacityKwp: Number((d as unknown as { plant?: { capacityKwp?: unknown } }).plant?.capacityKwp ?? 0),
        currentStatus: d.currentStatus,
      });
      ok++;
    } catch (err) {
      fail++;
      console.error(`[ingest] persist failed for ${d.externalId}:`, (err as Error).message);
    }
  }
  const dur = Date.now() - started;
  console.log(`[ingest] tick done · ok=${ok} fail=${fail} skipped=${skipped} · ${dur}ms`);
  return { ok, fail, skipped };
}

// CLI mode: run a single tick and exit.
if (import.meta.url === `file://${process.argv[1]}`) {
  console.log(`[ingest] one-shot · base=${process.env.MIDDLEWARE_BASE_URL}`);
  tick()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
