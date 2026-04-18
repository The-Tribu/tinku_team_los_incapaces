#!/usr/bin/env tsx
/**
 * Playwright scraper for DeyeCloud demo stations.
 *
 * Emulates integrating a provider with no official API: launches a real
 * headless browser, navigates to the provider's web portal (/deye-demo),
 * and extracts live telemetry directly from the rendered DOM — exactly as
 * an operator would scrape a real monitoring portal.
 *
 * Extraction strategy:
 *   • Clicks each station selector button in the portal header.
 *   • Waits for React state to propagate to the DOM
 *     (polls `data-deye-snapshot` on the root div until stationId matches).
 *   • Reads the full JSON snapshot embedded in that attribute and individual
 *     `data-metric` spans as fallback validation.
 *   • Feeds the extracted payload through the same persist → evaluateRules
 *     pipeline used by every other provider.
 *
 * Usage:
 *   npm run scrape:deye:pw              continuous (SCRAPE_INTERVAL_MS, default 60 s)
 *   npm run scrape:deye:pw -- --once    single tick then exit
 *   npm run scrape:deye:pw -- --headed  visible browser window (debug)
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

import { chromium, type Browser } from "playwright";
import { prisma }        from "../lib/prisma";
import { evaluateRules } from "../lib/rules";
import { DEMO_STATIONS, type DeyeDemoReading } from "../lib/deye-sim";
import type { CanonicalReading } from "../lib/normalize";

const BASE_URL      = process.env.SCRAPE_BASE_URL    ?? "http://localhost:3000";
const INTERVAL_MS   = Number(process.env.SCRAPE_INTERVAL_MS ?? 60_000);
const ONESHOT       = process.argv.includes("--once");
const HEADED        = process.argv.includes("--headed");
const PROVIDER_SLUG = "deye_demo";

// ── Canonical mapping ─────────────────────────────────────────────────────────

function toCanonical(r: DeyeDemoReading): CanonicalReading {
  return {
    device_external_id: r.stationId,
    power_ac_kw:   r.power_ac_kw,
    voltage_v:     r.voltage_v,
    current_a:     r.current_a,
    frequency_hz:  r.frequency_hz,
    power_factor:  r.power_factor,
    temperature_c: r.temperature_c,
    energy_kwh:    r.energy_kwh,
    status:        r.status,
    ts:            r.ts,
  };
}

// ── DB bootstrap ──────────────────────────────────────────────────────────────

async function ensureProvider(): Promise<string> {
  const p = await prisma.provider.upsert({
    where:  { slug: PROVIDER_SLUG },
    update: {
      displayName: "DeyeCloud Demo (playwright)",
      pollingMin:  Math.max(1, Math.round(INTERVAL_MS / 60_000)),
    },
    create: {
      slug:        PROVIDER_SLUG,
      displayName: "DeyeCloud Demo (playwright)",
      authType:    "scraping",
      pollingMin:  Math.max(1, Math.round(INTERVAL_MS / 60_000)),
      enabled:     true,
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
        name: station.name, clientId,
        capacityKwp: station.peakKwp,
        location:    station.location,
        lat: station.lat, lng: station.lng,
      },
    });
    plantId = existing.id;
  } else {
    const created = await prisma.plant.create({
      data: {
        code: station.id, name: station.name, clientId,
        capacityKwp: station.peakKwp,
        location:    station.location,
        lat: station.lat, lng: station.lng,
        contractType: "Leasing",
      },
    });
    plantId = created.id;
  }

  const device = await prisma.device.upsert({
    where:  { providerId_externalId: { providerId, externalId: station.id } },
    update: {},
    create: {
      plantId, providerId,
      externalId:    station.id,
      kind:          "inverter",
      model:         "Deye SUN-8K-SG03LP1 (demo)",
      currentStatus: "offline",
    },
  });
  return device.id;
}

// ── Persist ───────────────────────────────────────────────────────────────────

async function persist(deviceId: string, canonical: CanonicalReading, raw: DeyeDemoReading) {
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

// ── Browser lifecycle ─────────────────────────────────────────────────────────
// Keep one browser instance alive across ticks to avoid cold-start overhead.

let browser: Browser | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browser || !browser.isConnected()) {
    browser = await chromium.launch({ headless: !HEADED });
  }
  return browser;
}

// ── Playwright tick ───────────────────────────────────────────────────────────

async function tick(deviceMap: Map<string, string>) {
  const t0 = Date.now();
  let ok = 0, fail = 0;

  const b    = await getBrowser();
  const page = await b.newPage();

  // Silence console noise from the portal itself
  page.on("console", () => {});

  try {
    console.log(`[pw-scraper] navigating → ${BASE_URL}/deye-demo`);
    await page.goto(`${BASE_URL}/deye-demo`, { waitUntil: "domcontentloaded", timeout: 15_000 });

    // Wait for React to hydrate and the first interval tick to fire
    await page.waitForSelector("[data-deye-snapshot]", { timeout: 10_000 });
    await page.waitForTimeout(1_800); // ensure at least one 1-second tick has passed

    for (let i = 0; i < DEMO_STATIONS.length; i++) {
      const station  = DEMO_STATIONS[i];
      const deviceId = deviceMap.get(station.id);
      if (!deviceId) { fail++; continue; }

      // ── 1. Switch to this station ──────────────────────────────────────────
      if (i > 0) {
        // The portal renders one button per station; match by the two-word label
        const label = station.name.split(" ").slice(0, 2).join(" ");
        try {
          await page.click(`header button:has-text("${label}")`, { timeout: 3_000 });
        } catch {
          console.warn(`[pw-scraper] could not click button for "${label}", retrying by index`);
          // Fallback: click nth button inside the header station-selector group
          await page.evaluate((idx) => {
            const btns = document.querySelectorAll<HTMLButtonElement>("header button");
            btns[idx]?.click();
          }, i);
        }
      }

      // ── 2. Wait until DOM snapshot reflects this station ──────────────────
      // React updates [data-deye-snapshot] on every render tick; poll until
      // the stationId inside the JSON matches what we expect.
      try {
        await page.waitForFunction(
          (expectedId: string) => {
            const el = document.querySelector("[data-deye-snapshot]");
            if (!el) return false;
            try {
              const snap = JSON.parse(el.getAttribute("data-deye-snapshot") ?? "{}") as { stationId?: string };
              return snap.stationId === expectedId;
            } catch { return false; }
          },
          station.id,
          { timeout: 5_000, polling: 200 },
        );
      } catch {
        console.warn(`[pw-scraper] timeout waiting for snapshot of ${station.id}`);
        fail++;
        continue;
      }

      // ── 3. Extract snapshot JSON ───────────────────────────────────────────
      const snapshotJson = await page.evaluate(() =>
        document.querySelector("[data-deye-snapshot]")?.getAttribute("data-deye-snapshot") ?? ""
      );

      if (!snapshotJson) {
        console.warn(`[pw-scraper] empty snapshot for ${station.id}`);
        fail++;
        continue;
      }

      let raw: DeyeDemoReading;
      try {
        raw = JSON.parse(snapshotJson) as DeyeDemoReading;
      } catch (err) {
        console.warn(`[pw-scraper] JSON parse error for ${station.id}:`, (err as Error).message);
        fail++;
        continue;
      }

      // ── 4. Optional: cross-validate individual data-metric spans ──────────
      // This mirrors what a scraper would do against a real provider portal:
      // read visible DOM values and compare against the embedded JSON.
      const domPower = await page.evaluate(() => {
        const el = document.querySelector<HTMLElement>("[data-metric='power_ac_kw']");
        return el ? parseFloat(el.textContent ?? "NaN") : null;
      });
      if (domPower !== null && Math.abs(domPower - raw.power_ac_kw) > 0.1) {
        console.warn(
          `[pw-scraper] ${station.id} DOM/snapshot mismatch ` +
          `dom=${domPower.toFixed(2)} snap=${raw.power_ac_kw.toFixed(2)} — using snapshot`,
        );
      }

      // ── 5. Persist & evaluate rules ───────────────────────────────────────
      const canonical = toCanonical(raw);
      try {
        await persist(deviceId, canonical, raw);
        await evaluateRules(canonical, {
          deviceId,
          plantCapacityKwp: station.peakKwp,
          currentStatus:    canonical.status,
        });
        console.log(
          `[pw-scraper] ✓ ${station.id}` +
          `  power=${raw.power_ac_kw.toFixed(2)} kW` +
          `  energy=${raw.energy_kwh.toFixed(1)} kWh` +
          `  soc=${raw.battery_soc_pct.toFixed(0)}%` +
          `  temp=${raw.temperature_c.toFixed(1)}°C` +
          `  status=${canonical.status}`,
        );
        ok++;
      } catch (err) {
        fail++;
        console.error(`[pw-scraper] ✗ ${station.id}:`, (err as Error).message);
      }
    }
  } catch (err) {
    console.error("[pw-scraper] page-level error:", (err as Error).message);
    // Force browser reset on unexpected crash
    await browser?.close().catch(() => {});
    browser = null;
  } finally {
    await page.close().catch(() => {});
  }

  console.log(`[pw-scraper] tick done · ok=${ok} fail=${fail} · ${Date.now() - t0}ms\n`);
}

// ── Entry point ───────────────────────────────────────────────────────────────

async function main() {
  console.log("[pw-scraper] starting — Playwright browser scraper");
  console.log(`[pw-scraper] portal  = ${BASE_URL}/deye-demo`);
  console.log(`[pw-scraper] interval = ${INTERVAL_MS}ms`);
  console.log(`[pw-scraper] oneshot  = ${ONESHOT}`);
  console.log(`[pw-scraper] headed   = ${HEADED}\n`);

  const providerId = await ensureProvider();
  const deviceMap  = new Map<string, string>();

  for (const station of DEMO_STATIONS) {
    const deviceId = await ensureDevice(providerId, station);
    deviceMap.set(station.id, deviceId);
    console.log(`[pw-scraper] ready  ${station.id}  →  device ${deviceId}  (${station.region})`);
  }
  console.log();

  await tick(deviceMap);
  if (ONESHOT) {
    await browser?.close().catch(() => {});
    await prisma.$disconnect();
    return;
  }

  const timer = setInterval(() => void tick(deviceMap), INTERVAL_MS);
  const shutdown = async () => {
    clearInterval(timer);
    await browser?.close().catch(() => {});
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT",  shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch(e => { console.error(e); process.exit(1); });
