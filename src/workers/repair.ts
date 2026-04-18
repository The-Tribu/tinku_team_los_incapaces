#!/usr/bin/env tsx
/**
 * SunHub · Repair worker.
 *
 * Cierra el loop del self-repair agentic. Cada N min:
 *   1. Verifica remediaciones executed REAL sin verifiedAt (>5min de antigüedad)
 *      llamando a verify() — solo Deye expone GET /v1.0/order/{id} hoy.
 *   2. Reintenta remediaciones failed transitorias cuyo nextRetryAt está vencido
 *      (re-aprueba y vuelve a executar; el límite de retries vive en remediation.ts).
 *   3. Cancela remediaciones proposed/approved cuyo alarm origen ya está resuelto
 *      (la condición desapareció antes de que actuáramos).
 *
 * Idempotente: si la última corrida no terminó algo, la siguiente lo levanta.
 * Diseño: NUNCA crea remediaciones nuevas — solo opera sobre las existentes.
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

import { prisma } from "../lib/prisma";
import { execute, markForRetry, verify, cancel } from "../lib/remediation";

const VERIFY_AGE_MIN = Number(process.env.REPAIR_VERIFY_AGE_MIN ?? 5);
const MAX_BATCH = Number(process.env.REPAIR_MAX_BATCH ?? 10);

function killSwitch(): boolean {
  const v = process.env.SELF_REPAIR_DISABLED;
  return v === "1" || v?.toLowerCase() === "true";
}

async function verifyPending(): Promise<{ verified: number; failed: number }> {
  // executed + real + sin verify + executedAt >= ageThreshold
  const ageThreshold = new Date(Date.now() - VERIFY_AGE_MIN * 60_000);
  const rows = await prisma.remediation.findMany({
    where: {
      status: "executed",
      executionMode: "real",
      verifiedAt: null,
      executedAt: { lte: ageThreshold, not: null },
    },
    take: MAX_BATCH,
    orderBy: { executedAt: "asc" },
    select: { id: true },
  });
  let verified = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await verify(r.id);
      verified++;
    } catch (err) {
      failed++;
      console.warn(`[repair] verify ${r.id} → ${(err as Error).message}`);
    }
  }
  return { verified, failed };
}

async function retryDue(): Promise<{ retried: number; reExecuted: number; failed: number }> {
  const now = new Date();
  const rows = await prisma.remediation.findMany({
    where: {
      status: "failed",
      nextRetryAt: { lte: now, not: null },
    },
    take: MAX_BATCH,
    orderBy: { nextRetryAt: "asc" },
    select: { id: true, retryCount: true },
  });
  let retried = 0;
  let reExecuted = 0;
  let failed = 0;
  for (const r of rows) {
    try {
      await markForRetry(r.id);
      retried++;
      // execute() reusa la política y respeta canExecuteToday()
      await execute(r.id, { isRetry: true });
      reExecuted++;
    } catch (err) {
      failed++;
      console.warn(`[repair] retry ${r.id} → ${(err as Error).message}`);
    }
  }
  return { retried, reExecuted, failed };
}

async function cancelStale(): Promise<{ cancelled: number }> {
  // Remediations proposed/approved cuya alarma origen ya fue resolvida hace >2min.
  const since = new Date(Date.now() - 2 * 60_000);
  const rows = await prisma.remediation.findMany({
    where: {
      status: { in: ["proposed", "approved"] },
      alarmId: { not: null },
      alarm: { resolvedAt: { not: null, lte: since } },
    },
    take: MAX_BATCH,
    select: { id: true, alarmId: true },
  });
  let cancelled = 0;
  for (const r of rows) {
    try {
      await cancel(r.id, null, "alarma origen autorresuelta antes de ejecutar", "system");
      cancelled++;
    } catch (err) {
      console.warn(`[repair] cancel ${r.id} → ${(err as Error).message}`);
    }
  }
  return { cancelled };
}

export async function repairTick() {
  const started = Date.now();
  if (killSwitch()) {
    console.log("[repair] SELF_REPAIR_DISABLED=1 — no-op");
    return { verified: 0, retried: 0, reExecuted: 0, cancelled: 0, failed: 0 };
  }
  const v = await verifyPending();
  const r = await retryDue();
  const c = await cancelStale();
  const dur = Date.now() - started;
  const summary = {
    verified: v.verified,
    retried: r.retried,
    reExecuted: r.reExecuted,
    cancelled: c.cancelled,
    failed: v.failed + r.failed,
  };
  console.log(
    `[repair] tick · verified=${summary.verified} retried=${summary.retried} reExec=${summary.reExecuted} cancelled=${summary.cancelled} failed=${summary.failed} · ${dur}ms`,
  );
  return summary;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  repairTick()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
