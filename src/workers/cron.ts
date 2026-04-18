#!/usr/bin/env tsx
/**
 * SunHub · Cron worker
 *
 * Drives two recurring jobs against the hackathon middleware:
 *   1. ingest-tick     — poll each device for the latest reading
 *   2. plants-sync     — refresh plant/device catalog from the provider
 *
 * Schedules are standard 5-field cron expressions. Defaults:
 *   CRON_INGEST_SCHEDULE       = "*\/5 * * * *"   (every 5 minutes)
 *   CRON_PLANTS_SYNC_SCHEDULE  = "0 * * * *"     (every hour at :00)
 *   CRON_TIMEZONE              = "America/Bogota"
 *
 * Run with: `make cron`  (or `npm run cron`)
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

import cron from "node-cron";
import { prisma } from "../lib/prisma";
import { tick as ingestTick } from "./ingest";
import { ingestAlarms } from "./alarms";
import { syncRealPlants } from "../../scripts/sync-real-plants";
import { updateBaselines } from "../../scripts/update-baselines";
import { runDueSchedules } from "../lib/report-schedules";

const INGEST_SCHEDULE = process.env.CRON_INGEST_SCHEDULE ?? "*/5 * * * *";
const ALARMS_SCHEDULE = process.env.CRON_ALARMS_SCHEDULE ?? "* * * * *"; // cada minuto
const PLANTS_SYNC_SCHEDULE = process.env.CRON_PLANTS_SYNC_SCHEDULE ?? "0 * * * *";
const BASELINES_SCHEDULE = process.env.CRON_BASELINES_SCHEDULE ?? "15 3 * * *"; // 03:15 local
const REPORT_SCHEDULES_SCHEDULE = process.env.CRON_REPORT_SCHEDULES_SCHEDULE ?? "* * * * *"; // cada minuto
const TIMEZONE = process.env.CRON_TIMEZONE ?? "America/Bogota";
const RUN_ON_START = process.env.CRON_RUN_ON_START !== "0";

function assertValid(expr: string, label: string) {
  if (!cron.validate(expr)) {
    console.error(`[cron] invalid ${label} expression: "${expr}"`);
    process.exit(1);
  }
}

async function safeRun(label: string, fn: () => Promise<unknown>) {
  const started = Date.now();
  console.log(`[cron] ▶ ${label} start`);
  try {
    await fn();
    console.log(`[cron] ✓ ${label} done · ${Date.now() - started}ms`);
  } catch (err) {
    console.error(`[cron] ✗ ${label} failed:`, (err as Error).message);
  }
}

async function main() {
  assertValid(INGEST_SCHEDULE, "CRON_INGEST_SCHEDULE");
  assertValid(ALARMS_SCHEDULE, "CRON_ALARMS_SCHEDULE");
  assertValid(PLANTS_SYNC_SCHEDULE, "CRON_PLANTS_SYNC_SCHEDULE");
  assertValid(BASELINES_SCHEDULE, "CRON_BASELINES_SCHEDULE");
  assertValid(REPORT_SCHEDULES_SCHEDULE, "CRON_REPORT_SCHEDULES_SCHEDULE");

  console.log("[cron] starting SunHub cron worker");
  console.log(`[cron]   ingest           → ${INGEST_SCHEDULE} (${TIMEZONE})`);
  console.log(`[cron]   alarms           → ${ALARMS_SCHEDULE} (${TIMEZONE})`);
  console.log(`[cron]   plants-sync      → ${PLANTS_SYNC_SCHEDULE} (${TIMEZONE})`);
  console.log(`[cron]   baselines        → ${BASELINES_SCHEDULE} (${TIMEZONE})`);
  console.log(`[cron]   report-schedules → ${REPORT_SCHEDULES_SCHEDULE} (${TIMEZONE})`);
  console.log(`[cron]   middleware       → ${process.env.MIDDLEWARE_BASE_URL ?? "(unset)"}`);

  cron.schedule(INGEST_SCHEDULE, () => void safeRun("ingest", ingestTick), { timezone: TIMEZONE });
  cron.schedule(ALARMS_SCHEDULE, () => void safeRun("alarms", ingestAlarms), { timezone: TIMEZONE });
  cron.schedule(PLANTS_SYNC_SCHEDULE, () => void safeRun("plants-sync", syncRealPlants), {
    timezone: TIMEZONE,
  });
  cron.schedule(BASELINES_SCHEDULE, () => void safeRun("baselines", updateBaselines), {
    timezone: TIMEZONE,
  });
  cron.schedule(
    REPORT_SCHEDULES_SCHEDULE,
    () =>
      void safeRun("report-schedules", async () => {
        const res = await runDueSchedules();
        if (res.checked > 0) {
          console.log(
            `[cron]   report-schedules: ${res.executed}/${res.checked} ok · ${res.failed} failed`,
          );
        }
      }),
    { timezone: TIMEZONE },
  );

  if (RUN_ON_START) {
    await safeRun("plants-sync (bootstrap)", syncRealPlants);
    await safeRun("ingest (bootstrap)", ingestTick);
    await safeRun("alarms (bootstrap)", ingestAlarms);
    await safeRun("baselines (bootstrap)", updateBaselines);
    await safeRun("report-schedules (bootstrap)", async () => {
      const res = await runDueSchedules();
      console.log(
        `[cron]   report-schedules: ${res.executed}/${res.checked} ok · ${res.failed} failed`,
      );
    });
  }

  const shutdown = async (signal: string) => {
    console.log(`[cron] ${signal} received, shutting down…`);
    await prisma.$disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[cron] fatal:", err);
  process.exit(1);
});
