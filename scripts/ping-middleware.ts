#!/usr/bin/env tsx
/**
 * Middleware connectivity probe.
 * Loads .env.local, hits a few well-known endpoints per provider
 * and reports which ones respond so we know what's available in the hackathon sandbox.
 *
 * Run: npm run mw:ping
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
      const v = rawV.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      process.env[k] = v;
    }
  } catch {
    /* optional */
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

import { mw, MiddlewareError } from "../src/lib/middleware";

type Probe = { label: string; method: "GET" | "POST"; path: string; body?: unknown };

const PROBES: Probe[] = [
  { label: "Root",                  method: "GET",  path: "/" },
  { label: "Health",                method: "GET",  path: "/health" },
  { label: "Growatt · plant list",  method: "GET",  path: "/growatt/v1/plant/list" },
  { label: "Huawei · stations",     method: "POST", path: "/huawei/thirdData/getStationList", body: {} },
  { label: "Deye · stations",       method: "POST", path: "/deye/v1.0/station/list", body: {} },
  { label: "Hoymiles · plants",     method: "POST", path: "/hoymiles/pv/station/select_by_page", body: { page: 1, page_size: 10 } },
  { label: "SRNE · stations",       method: "GET",  path: "/srne/station/list" },
  { label: "SolarMan · stations",   method: "POST", path: "/solarman/v1.0/station/list", body: {} },
];

async function probe(p: Probe) {
  const t0 = Date.now();
  try {
    const init: RequestInit = { method: p.method };
    if (p.body !== undefined) init.body = JSON.stringify(p.body);
    const res = await mw(p.path, init);
    const ms = Date.now() - t0;
    const preview =
      typeof res === "string"
        ? res.slice(0, 120)
        : JSON.stringify(res).slice(0, 120);
    return { ok: true as const, ms, preview };
  } catch (err) {
    const ms = Date.now() - t0;
    if (err instanceof MiddlewareError) {
      return { ok: false as const, ms, status: err.status, preview: err.body.slice(0, 120) };
    }
    return { ok: false as const, ms, status: 0, preview: (err as Error).message };
  }
}

async function main() {
  if (!process.env.MIDDLEWARE_BASE_URL || !process.env.MIDDLEWARE_API_KEY) {
    console.error("✗ Missing MIDDLEWARE_BASE_URL or MIDDLEWARE_API_KEY in .env.local");
    process.exit(1);
  }
  console.log(`→ Base: ${process.env.MIDDLEWARE_BASE_URL}`);
  console.log(`→ Key : ${process.env.MIDDLEWARE_API_KEY!.slice(0, 10)}…\n`);

  let pass = 0;
  for (const p of PROBES) {
    const r = await probe(p);
    if (r.ok) {
      pass++;
      console.log(`✓ ${p.label.padEnd(28)} ${String(r.ms).padStart(5)}ms  ${r.preview}`);
    } else {
      console.log(`✗ ${p.label.padEnd(28)} ${String(r.ms).padStart(5)}ms  [${r.status}] ${r.preview}`);
    }
  }
  console.log(`\n${pass}/${PROBES.length} endpoints responded OK.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
