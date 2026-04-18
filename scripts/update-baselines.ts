#!/usr/bin/env tsx
/**
 * Actualiza los baselines rolling (media, stddev, p05/p50/p95) por device+métrica.
 * Corre nightly vía cron. En un repo de hackathon recién arrancado puede no
 * haber lecturas suficientes; en ese caso los baselines simplemente no se
 * escriben y el detector de anomalías hace no-op hasta que haya historia.
 *
 * Uso:
 *   npm run baselines
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
    /* optional */
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

import { prisma } from "../src/lib/prisma";
import { refreshAllBaselines } from "../src/lib/baselines";

export async function updateBaselines() {
  const started = Date.now();
  const res = await refreshAllBaselines();
  console.log(
    `[baselines] devices=${res.devices} updated=${res.updated} skipped=${res.skipped} · ${Date.now() - started}ms`,
  );
  return res;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  updateBaselines()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
