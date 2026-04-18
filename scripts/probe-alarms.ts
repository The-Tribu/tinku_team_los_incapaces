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
import { mw } from "../src/lib/middleware";

type Probe = { path: string; method: "GET" | "POST"; body?: unknown; label: string };

const probes: Probe[] = [
  // Growatt alarm candidates
  { label: "growatt /new_alarm/list", path: "/growatt/v1/new_alarm/list", method: "GET" },
  { label: "growatt /new_alarm?plant_id=1356131", path: "/growatt/v1/new_alarm/list?plant_id=1356131", method: "GET" },
  { label: "growatt /device/fault", path: "/growatt/v1/device/fault", method: "GET" },
  { label: "growatt /plant/fault", path: "/growatt/v1/plant/fault", method: "GET" },
  { label: "growatt /alarm/list", path: "/growatt/v1/alarm/list", method: "GET" },
  { label: "growatt /device/list?plant_id=1356131", path: "/growatt/v1/device/list?plant_id=1356131", method: "GET" },

  // Deye alarm candidates (docs: alarm/listByPage requires POST)
  { label: "deye /alarm/listByPage", path: "/deye/v1.0/alarm/listByPage", method: "POST", body: { page: 1, size: 20 } },
  { label: "deye /alarm/list", path: "/deye/v1.0/alarm/list", method: "POST", body: { page: 1, size: 20 } },
  { label: "deye /station/alarm?stationId=40760", path: "/deye/v1.0/station/alarm?stationId=40760", method: "GET" },
  { label: "deye /device/alarm/listByPage", path: "/deye/v1.0/device/alarm/listByPage", method: "POST", body: { page: 1, size: 20, stationId: 148520 } },
  { label: "deye /device/list/listByPage", path: "/deye/v1.0/device/list", method: "POST", body: { page: 1, size: 20, stationId: 148520 } },
];

async function main() {
  for (const p of probes) {
    try {
      const init: RequestInit = { method: p.method };
      if (p.body !== undefined) init.body = JSON.stringify(p.body);
      const res = await mw<any>(p.path, init);
      const preview = typeof res === "string" ? res.slice(0, 160) : JSON.stringify(res).slice(0, 220);
      console.log(`✓ ${p.label} → ${preview}`);
    } catch (e) {
      console.log(`✗ ${p.label} → ${(e as Error).message.slice(0, 160)}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
