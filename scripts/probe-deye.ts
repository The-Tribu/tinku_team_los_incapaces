import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { brotliDecompressSync, gunzipSync, inflateSync, inflateRawSync } from "node:zlib";

for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || m[1].startsWith("#")) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

async function main() {
  const BASE = process.env.MIDDLEWARE_BASE_URL!;
  const KEY = process.env.MIDDLEWARE_API_KEY!;

  const res = await fetch(`${BASE}/deye/v1.0/station/list`, {
    method: "POST",
    headers: {
      Authorization: KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Accept-Encoding": "identity",
    },
    body: JSON.stringify({ page: 1, size: 50 }),
  });
  const buf = Buffer.from(await res.arrayBuffer());
  console.log("status", res.status);
  console.log("content-encoding header:", res.headers.get("content-encoding"));
  console.log("content-type:", res.headers.get("content-type"));
  console.log("len:", buf.length, "first16 hex:", buf.slice(0, 16).toString("hex"));

  const decoders: Array<[string, () => Buffer]> = [
    ["brotli", () => brotliDecompressSync(buf)],
    ["gunzip", () => gunzipSync(buf)],
    ["inflate", () => inflateSync(buf)],
    ["inflate-raw", () => inflateRawSync(buf)],
    ["skip-4bytes + inflate-raw", () => inflateRawSync(buf.slice(4))],
    ["skip-4bytes + gunzip", () => gunzipSync(buf.slice(4))],
    ["skip-4bytes + brotli", () => brotliDecompressSync(buf.slice(4))],
  ];
  for (const [name, fn] of decoders) {
    try {
      const out = fn();
      console.log(`✓ ${name} → ${out.length} bytes. preview: ${out.toString("utf8").slice(0, 250)}`);
    } catch (e) {
      console.log(`✗ ${name}: ${(e as Error).message.slice(0, 80)}`);
    }
  }

  // Also try asking the server NOT to compress (Accept-Encoding identity)
  console.log("\nTrying without gzip/br negotiation... (already sent identity)");
}
main().catch((e) => { console.error(e); process.exit(1); });
