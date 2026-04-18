#!/usr/bin/env tsx
/**
 * Polling worker that pulls readings from the middleware and persists
 * them to Postgres via Prisma.
 *
 * Run with: npm run ingest
 *
 * Behaviour:
 *   - Reads all Plants from the DB together with their Provider.
 *   - For each plant, hits the provider's reading endpoint.
 *   - Normalizes the response → CanonicalReading.
 *   - Upserts a single virtual "plant-level" device per plant (since the
 *     sandbox only exposes plant-level aggregates reliably), then writes
 *     a Reading row and a best-effort rules pass for alarm creation.
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
import { syntheticReading } from "../lib/synthetic";
import { evaluateRules } from "../lib/rules";
import { evaluateRemediation } from "../lib/remediation/evaluator";

const POLL_INTERVAL_MS = Number(process.env.INGEST_INTERVAL_MS ?? 60_000);
const ONESHOT = process.argv.includes("--once");
// When set, synthesize readings whenever the provider response is
// unparseable (e.g. the middleware currently returns encrypted Growatt
// payloads). Defaults to true in non-production so the demo is live.
const ALLOW_SYNTHETIC =
  process.env.INGEST_SYNTHETIC === "0"
    ? false
    : process.env.INGEST_SYNTHETIC === "1"
      ? true
      : process.env.NODE_ENV !== "production";

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

async function tick() {
  const started = Date.now();
  const devices = await prisma.device.findMany({
    include: { provider: true, plant: { select: { capacityKwp: true } } },
  });
  if (devices.length === 0) {
    console.log("[ingest] no devices in DB — run `npm run db:seed` first");
    return;
  }

  let realOk = 0;
  let synthOk = 0;
  let fail = 0;
  let remediationCount = 0;
  for (const d of devices) {
    const slug = d.provider.slug as ProviderSlug;
    if (!(slug in providers)) {
      fail++;
      continue;
    }
    let reading = await fetchReading(slug, d.externalId);
    let source: "real" | "synthetic" = "real";
    if (!reading && ALLOW_SYNTHETIC) {
      const plant = await prisma.plant.findUnique({ where: { id: d.plantId } });
      reading = syntheticReading({
        externalId: d.externalId,
        capacityKwp: Number(plant?.capacityKwp ?? 100),
        forcedStatus: d.currentStatus as never,
      });
      source = "synthetic";
    }
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
      try {
        const results = await evaluateRemediation(d.id);
        remediationCount += results.filter((r) => r.status === "success").length;
      } catch (err) {
        console.warn(`[ingest] remediation eval failed for ${d.externalId}:`, (err as Error).message);
      }
      if (source === "real") realOk++;
      else synthOk++;
    } catch (err) {
      fail++;
      console.error(`[ingest] persist failed for ${d.externalId}:`, (err as Error).message);
    }
  }
  const dur = Date.now() - started;
  console.log(
    `[ingest] tick done · real=${realOk} synth=${synthOk} fail=${fail} remedied=${remediationCount} · ${dur}ms`,
  );
}

async function main() {
  console.log(
    `[ingest] starting · interval=${POLL_INTERVAL_MS}ms · oneshot=${ONESHOT} · base=${process.env.MIDDLEWARE_BASE_URL}`,
  );
  await tick();
  if (ONESHOT) {
    await prisma.$disconnect();
    return;
  }
  const timer = setInterval(() => void tick(), POLL_INTERVAL_MS);
  const shutdown = async () => {
    clearInterval(timer);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
