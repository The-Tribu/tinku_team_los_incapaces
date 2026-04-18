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

const bodies = [
  { page: 1, size: 20, stationId: "148520" },
  { page: 1, size: 20, station_id: 148520 },
  { page: 1, size: 20, stationId: 148520 },
  { pageNo: 1, pageSize: 20, stationId: 148520 },
  { stationId: 148520 },
];
async function main() {
  for (const b of bodies) {
    try {
      const res = await mw<any>("/deye/v1.0/device/list", { method: "POST", body: JSON.stringify(b) });
      console.log(`✓ ${JSON.stringify(b)} → ${JSON.stringify(res).slice(0, 400)}`);
    } catch (e) {
      console.log(`✗ ${JSON.stringify(b)} → ${(e as Error).message.slice(0, 160)}`);
    }
  }
  // station/latest for real stations (power readings)
  console.log("\n--- station/latest ---");
  for (const id of [40760, 41053, 122825, 148520, 155158, 166961]) {
    try {
      const r = await mw<any>("/deye/v1.0/station/latest", { method: "POST", body: JSON.stringify({ stationId: id }) });
      console.log(`✓ latest ${id} → ${JSON.stringify(r).slice(0, 300)}`);
    } catch (e) {
      console.log(`✗ latest ${id} → ${(e as Error).message.slice(0, 120)}`);
    }
  }
}
main().catch((e) => { console.error(e); process.exit(1); });
