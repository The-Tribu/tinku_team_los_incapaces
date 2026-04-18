#!/usr/bin/env tsx
/**
 * Post-remediation verifier.
 *
 * Every 5 min, revisits `RemediationAction` rows that executed successfully
 * but haven't been verified yet. If the linked alarm is resolved, marks the
 * outcome as `resolved`; otherwise `no_change`. For Deye live mode, a
 * response-body `orderId` also triggers `GET /deye/v1.0/order/{orderId}` to
 * record the latest order status.
 *
 * Run with: `tsx src/workers/verify-remediation.ts`
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
  } catch {}
}
loadDotEnv(".env.local");
loadDotEnv(".env");

import { prisma } from "../lib/prisma";
import { mw, MiddlewareError } from "../lib/middleware";

const VERIFY_AFTER_MS = 5 * 60_000;

async function tick() {
  const cutoff = new Date(Date.now() - VERIFY_AFTER_MS);
  const pending = await prisma.remediationAction.findMany({
    where: {
      status: "success",
      verifiedAt: null,
      executedAt: { lte: cutoff },
      executionMode: { in: ["live", "shadow"] },
    },
    include: {
      alarm: true,
      device: { include: { provider: true } },
    },
    take: 50,
  });

  let resolved = 0;
  let unchanged = 0;
  for (const r of pending) {
    let outcome: "resolved" | "no_change" = "no_change";
    if (r.alarm && r.alarm.resolvedAt) outcome = "resolved";

    let orderStatus: unknown = null;
    if (r.device.provider.slug === "deye" && r.executionMode === "live") {
      const resp = r.responseBody as { orderId?: string | null } | null;
      const orderId = resp?.orderId;
      if (orderId) {
        try {
          orderStatus = await mw(`/deye/v1.0/order/${orderId}`);
        } catch (err) {
          if (err instanceof MiddlewareError) {
            orderStatus = { error: `mw ${err.status}` };
          } else {
            orderStatus = { error: (err as Error).message };
          }
        }
      }
    }

    await prisma.remediationAction.update({
      where: { id: r.id },
      data: {
        outcome,
        verifiedAt: new Date(),
        responseBody: orderStatus
          ? { ...((r.responseBody as object | null) ?? {}), orderStatus }
          : r.responseBody === null
            ? undefined
            : (r.responseBody as object),
      },
    });
    if (outcome === "resolved") resolved++;
    else unchanged++;
  }

  if (pending.length > 0) {
    console.log(
      `[verify] ${pending.length} pendientes verificadas · ${resolved} resueltas · ${unchanged} sin cambio`,
    );
  }
}

async function loop() {
  console.log("[verify] worker iniciado, intervalo 5min");
  while (true) {
    try {
      await tick();
    } catch (err) {
      console.error("[verify] tick failed:", (err as Error).message);
    }
    await new Promise((r) => setTimeout(r, VERIFY_AFTER_MS));
  }
}

loop().catch((err) => {
  console.error(err);
  process.exit(1);
});
