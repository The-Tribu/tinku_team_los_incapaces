#!/usr/bin/env tsx
/**
 * Scraper for DeyeCloud demo stations.
 *
 * Simulates how SunHub would integrate a provider that has no official API:
 * instead of calling a proprietary SDK, we fetch the data from the provider's
 * web-facing endpoint (/api/deye-demo/[stationId]) and push it through the
 * same persist → rules pipeline used by real providers.
 *
 * The endpoint mirrors the values shown on the /deye-demo landing page using
 * the server-side demo clock, so the scraper always has fresh, daytime data
 * regardless of whether a browser is open.
 *
 * Usage:
 *   npm run scrape:deye              continuous (interval = SCRAPE_INTERVAL_MS)
 *   npm run scrape:deye -- --once    single tick then exit
 */

import { readFileSync } from "node:fs";
import { resolve }      from "node:path";

function loadDotEnv(file: string) {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, v] = m;
      if (!process.env[k])
        process.env[k] = v.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  } catch { /* file optional */ }
}
loadDotEnv(".env.local");
loadDotEnv(".env");

import { prisma }         from "../lib/prisma";
import { evaluateRules }  from "../lib/rules";
import { DEMO_STATIONS, type DeyeDemoReading } from "../lib/deye-sim";
import type { CanonicalReading } from "../lib/normalize";

const BASE_URL     = process.env.SCRAPE_BASE_URL    ?? "http://localhost:3000";
const INTERVAL_MS  = Number(process.env.SCRAPE_INTERVAL_MS ?? 60_000);
const ONESHOT      = process.argv.includes("--once");
const PROVIDER_SLUG = "deye_demo";

// ── Canonical mapping ─────────────────────────────────────────────────────────

function toCanonical(r: DeyeDemoReading): CanonicalReading {
  return {
    device_external_id: r.stationId,
    power_ac_kw:  r.power_ac_kw,
    voltage_v:    r.voltage_v,
    current_a:    r.current_a,
    frequency_hz: r.frequency_hz,
    power_factor: r.power_factor,
    temperature_c: r.temperature_c,
    energy_kwh:   r.energy_kwh,
    status:       r.status,
    ts:           r.ts,
  };
}

// ── Fetch from the provider endpoint ─────────────────────────────────────────
// This is the "scraping" step: call the station endpoint exactly as any HTTP
// client would, parse the JSON response, and hand it to the normalizer.

async function fetchStation(stationId: string): Promise<DeyeDemoReading | null> {
  const url = `${BASE_URL}/api/deye-demo/${encodeURIComponent(stationId)}`;
  try {
    const res = await fetch(url, {
      headers: { "Accept": "application/json" },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[scraper] ${stationId} → HTTP ${res.status}`);
      return null;
    }
    const data = await res.json() as DeyeDemoReading;
    if (!data?.stationId) {
      console.warn(`[scraper] ${stationId} → unexpected response shape`);
      return null;
    }
    return data;
  } catch (err) {
    console.warn(`[scraper] ${stationId} → ${(err as Error).message}`);
    return null;
  }
}

// ── DB bootstrap ──────────────────────────────────────────────────────────────

async function ensureProvider(): Promise<string> {
  const p = await prisma.provider.upsert({
    where:  { slug: PROVIDER_SLUG },
    update: { displayName: "DeyeCloud Demo (scraper)", pollingMin: Math.max(1, Math.round(INTERVAL_MS / 60_000)) },
    create: {
      slug: PROVIDER_SLUG,
      displayName: "DeyeCloud Demo (scraper)",
      authType: "scraping",
      pollingMin: Math.max(1, Math.round(INTERVAL_MS / 60_000)),
      enabled: true,
    },
  });
  return p.id;
}

async function upsertClient(name: string, region: string): Promise<string> {
  const existing = await prisma.client.findFirst({ where: { name } });
  if (existing) {
    if (existing.region !== region)
      await prisma.client.update({ where: { id: existing.id }, data: { region } });
    return existing.id;
  }
  const c = await prisma.client.create({ data: { name, region } });
  return c.id;
}

async function ensureDevice(
  providerId: string,
  station: (typeof DEMO_STATIONS)[number],
): Promise<string> {
  const clientId = await upsertClient(station.clientName, station.region);

  const existing = await prisma.plant.findUnique({ where: { code: station.id } });
  let plantId: string;

  if (existing) {
    await prisma.plant.update({
      where: { id: existing.id },
      data: {
        name: station.name,
        clientId,
        capacityKwp: station.peakKwp,
        location: station.location,
        lat: station.lat,
        lng: station.lng,
      },
    });
    plantId = existing.id;
  } else {
    const created = await prisma.plant.create({
      data: {
        code: station.id,
        name: station.name,
        clientId,
        capacityKwp: station.peakKwp,
        location: station.location,
        lat: station.lat,
        lng: station.lng,
        contractType: "Leasing",
      },
    });
    plantId = created.id;
  }

  const device = await prisma.device.upsert({
    where:  { providerId_externalId: { providerId, externalId: station.id } },
    update: {},   // no reset on re-run; status is managed by persist
    create: {
      plantId,
      providerId,
      externalId: station.id,
      kind: "inverter",
      model: "Deye SUN-8K-SG03LP1 (demo)",
      currentStatus: "offline",
    },
  });

  return device.id;
}

// ── Persist ───────────────────────────────────────────────────────────────────

async function persist(deviceId: string, canonical: CanonicalReading, raw: DeyeDemoReading) {
  // Always use real wall-clock time as the DB timestamp so ORDER BY ts DESC
  // picks up the newest scraper reading regardless of the simulated ts.
  await prisma.$transaction([
    prisma.reading.create({
      data: {
        deviceId,
        ts:           new Date(),
        powerAcKw:    canonical.power_ac_kw,
        voltageV:     canonical.voltage_v,
        currentA:     canonical.current_a,
        frequencyHz:  canonical.frequency_hz,
        powerFactor:  canonical.power_factor,
        temperatureC: canonical.temperature_c,
        energyKwh:    canonical.energy_kwh,
        raw:          raw as object,
      },
    }),
    prisma.device.update({
      where: { id: deviceId },
      data:  { currentStatus: canonical.status, lastSeenAt: new Date() },
    }),
  ]);
}

// ── Main tick ─────────────────────────────────────────────────────────────────

async function tick(deviceMap: Map<string, string>) {
  const t0 = Date.now();
  let ok = 0, fail = 0;

  for (const station of DEMO_STATIONS) {
    const deviceId = deviceMap.get(station.id);
    if (!deviceId) { fail++; continue; }

    // Scrape: read the provider's endpoint
    const raw = await fetchStation(station.id);
    if (!raw) { fail++; continue; }

    const canonical = toCanonical(raw);

    try {
      await persist(deviceId, canonical, raw);
      await evaluateRules(canonical, {
        deviceId,
        plantCapacityKwp: station.peakKwp,
        currentStatus:    canonical.status,
      });
      console.log(
        `[scraper] ✓ ${station.id}` +
        `  power=${raw.power_ac_kw.toFixed(2)} kW` +
        `  energy=${raw.energy_kwh.toFixed(1)} kWh` +
        `  temp=${raw.temperature_c.toFixed(1)}°C` +
        `  status=${canonical.status}`,
      );
      ok++;
    } catch (err) {
      fail++;
      console.error(`[scraper] ✗ ${station.id}:`, (err as Error).message);
    }
  }

  console.log(`[scraper] tick done · ok=${ok} fail=${fail} · ${Date.now() - t0}ms\n`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log(`[scraper] starting`);
  console.log(`[scraper] base     = ${BASE_URL}`);
  console.log(`[scraper] interval = ${INTERVAL_MS}ms`);
  console.log(`[scraper] oneshot  = ${ONESHOT}\n`);

  // Bootstrap DB entities once
  const providerId = await ensureProvider();
  const deviceMap  = new Map<string, string>();

  for (const station of DEMO_STATIONS) {
    const deviceId = await ensureDevice(providerId, station);
    deviceMap.set(station.id, deviceId);
    console.log(`[scraper] ready  ${station.id}  →  device ${deviceId}  (${station.region})`);
  }
  console.log();

  await tick(deviceMap);
  if (ONESHOT) { await prisma.$disconnect(); return; }

  const timer = setInterval(() => void tick(deviceMap), INTERVAL_MS);
  const shutdown = async () => {
    clearInterval(timer);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(e => { console.error(e); process.exit(1); });
