#!/usr/bin/env tsx
/**
 * Explore real middleware payloads across likely endpoint + param variants.
 * Results are appended to docs/resources/middleware-samples.json.
 */
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";

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

import { mw, MiddlewareError } from "../src/lib/middleware";

type Call = { label: string; method: "GET" | "POST"; path: string; body?: unknown };

const GROWATT_PID = 1356131;

const CALLS: Call[] = [
  // Growatt — try plant/list without params (we know this works) and variants for plant detail
  { label: "growatt/plant/list",              method: "GET",  path: "/growatt/v1/plant/list" },
  { label: "growatt/plant/list?page=1",       method: "GET",  path: "/growatt/v1/plant/list?page=1" },
  { label: "growatt/plant/data plant_id",     method: "GET",  path: `/growatt/v1/plant/data?plant_id=${GROWATT_PID}` },
  { label: "growatt/plant/detail plantId",    method: "GET",  path: `/growatt/v1/plant/detail?plantId=${GROWATT_PID}` },
  { label: "growatt/plant/detail plant_id",   method: "GET",  path: `/growatt/v1/plant/detail?plant_id=${GROWATT_PID}` },
  { label: "growatt/device/list plant_id",    method: "GET",  path: `/growatt/v1/device/list?plant_id=${GROWATT_PID}` },
  { label: "growatt/plant/energy plantId",    method: "GET",  path: `/growatt/v1/plant/energy?plantId=${GROWATT_PID}&date=2026-04-17` },
  { label: "growatt/plant/power plantId",     method: "GET",  path: `/growatt/v1/plant/power?plantId=${GROWATT_PID}&date=2026-04-17` },
  // Deye — try different auth / params shape
  { label: "deye/station/list empty",         method: "POST", path: "/deye/v1.0/station/list", body: {} },
  { label: "deye/station/list paged",         method: "POST", path: "/deye/v1.0/station/list", body: { page: 1, size: 20 } },
  { label: "deye/station/list snake",         method: "POST", path: "/deye/v1.0/station/list", body: { page_no: 1, page_size: 20 } },
];

async function main() {
  const out: Array<Call & { result?: unknown; error?: string; compressed?: boolean }> = [];
  for (const call of CALLS) {
    try {
      const init: RequestInit = { method: call.method };
      if (call.body !== undefined) init.body = JSON.stringify(call.body);
      const result = await mw(call.path, init);
      const preview =
        typeof result === "string"
          ? `<string ${result.length} chars> ${result.slice(0, 80).replace(/\n/g, " ")}`
          : JSON.stringify(result).slice(0, 240);
      out.push({ ...call, result });
      console.log(`✓ ${call.label.padEnd(36)} ${preview}`);
    } catch (err) {
      const msg =
        err instanceof MiddlewareError
          ? `[${err.status}] ${err.body.slice(0, 140).replace(/\n/g, " ")}`
          : (err as Error).message;
      out.push({ ...call, error: msg });
      console.log(`✗ ${call.label.padEnd(36)} ${msg}`);
    }
  }
  const outPath = resolve(process.cwd(), "docs/resources/middleware-samples.json");
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\n→ ${outPath}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
