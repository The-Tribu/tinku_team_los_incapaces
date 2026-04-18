/**
 * Remediation executor.
 *
 * Coordinates: policy lookup → safety rails (plant opt-out, cooldown,
 * max attempts, rate limit) → vendor adapter → dispatch → log.
 *
 * Honours `REMEDIATION_MODE`:
 *   - `dry_run`  (default): builds the exact request payload but never calls
 *                the middleware. The payload is persisted so the UI can show
 *                what would have been sent.
 *   - `shadow` : actually dispatches the request but marks outcome=no_change;
 *                useful once writes become available to validate responses
 *                without trusting them as fixes yet.
 *   - `live`   : full dispatch; verify job updates the outcome afterwards.
 */
import { Prisma } from "@prisma/client";
import { prisma } from "../prisma";
import { mw, MiddlewareError } from "../middleware";
import { getVendorAdapter } from "../vendors";
import type { VendorRequestPlan, VendorStepResult } from "../vendors/types";
import { findPolicy, mapAlarmToAction, severityExceeds } from "./policies";
import { tryConsume } from "./rate-limit";
import { aiAgentEnabled, decideRemediation } from "./ai-agent";

export type TriggerSource = "rule_engine" | "ai_agent" | "manual";
export type ExecutionMode = "dry_run" | "shadow" | "live";

export type ExecutionResult = {
  actionId: string | null;
  status:
    | "success"
    | "failed"
    | "skipped_no_policy"
    | "skipped_plant_disabled"
    | "skipped_cooldown"
    | "skipped_rate_limit"
    | "skipped_requires_human"
    | "skipped_severity"
    | "escalated_max_attempts"
    | "escalated_no_adapter"
    | "escalated_unsupported_action";
  mode: ExecutionMode;
  plan?: VendorRequestPlan;
  reason: string;
};

function currentMode(): ExecutionMode {
  const raw = (process.env.REMEDIATION_MODE ?? "dry_run").toLowerCase();
  if (raw === "live" || raw === "shadow" || raw === "dry_run") return raw;
  return "dry_run";
}

async function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function executeRemediation(
  alarmId: string,
  trigger: TriggerSource,
  opts: { forceDryRun?: boolean; overrideAction?: string } = {},
): Promise<ExecutionResult> {
  const alarm = await prisma.alarm.findUnique({
    where: { id: alarmId },
    include: {
      device: {
        include: {
          plant: true,
          provider: true,
        },
      },
    },
  });
  if (!alarm) {
    return { actionId: null, status: "failed", mode: currentMode(), reason: "alarm not found" };
  }
  if (alarm.resolvedAt) {
    return {
      actionId: null,
      status: "failed",
      mode: currentMode(),
      reason: "alarma ya resuelta",
    };
  }
  if (alarm.requiresHuman) {
    return {
      actionId: null,
      status: "skipped_requires_human",
      mode: currentMode(),
      reason: "alarma marcada como requires_human",
    };
  }
  if (!alarm.device.plant.autoRemediationEnabled) {
    return {
      actionId: null,
      status: "skipped_plant_disabled",
      mode: currentMode(),
      reason: "auto-remediación deshabilitada para esta planta",
    };
  }

  const providerSlug = alarm.device.provider.slug;
  const policy = await findPolicy(alarm.type, providerSlug);
  if (!policy) {
    return {
      actionId: null,
      status: "skipped_no_policy",
      mode: currentMode(),
      reason: `sin policy para ${alarm.type}/${providerSlug}`,
    };
  }
  if (policy.requiresHuman) {
    await prisma.alarm.update({ where: { id: alarm.id }, data: { requiresHuman: true } });
    return {
      actionId: null,
      status: "skipped_requires_human",
      mode: currentMode(),
      reason: "policy requiere intervención humana",
    };
  }
  if (severityExceeds(alarm.severity, policy.maxSeverity)) {
    return {
      actionId: null,
      status: "skipped_severity",
      mode: currentMode(),
      reason: `severity ${alarm.severity} excede max ${policy.maxSeverity}`,
    };
  }

  let actionType = opts.overrideAction ?? policy.actionType;
  let aiReasoning: string | null = null;
  let aiConfidence: number | null = null;

  if (!opts.overrideAction && policy.requiresAiDecision && aiAgentEnabled()) {
    const decision = await decideRemediation(alarm.id);
    aiReasoning = decision.reasoning;
    aiConfidence = decision.confidence;
    if (decision.used && decision.action !== "none") {
      actionType = decision.action;
    } else {
      return {
        actionId: null,
        status: "skipped_requires_human",
        mode: currentMode(),
        reason: `IA no recomienda acción (${decision.reasoning})`,
      };
    }
  }

  // Cooldown — ignora entradas `escalated_*` porque no implican ejecución real
  const cooldownSince = new Date(Date.now() - policy.cooldownMin * 60_000);
  if (policy.cooldownMin > 0) {
    const recent = await prisma.remediationAction.findFirst({
      where: {
        deviceId: alarm.deviceId,
        actionType,
        executedAt: { gte: cooldownSince },
        status: { in: ["success", "failed", "executing"] },
      },
      orderBy: { executedAt: "desc" },
    });
    if (recent) {
      return {
        actionId: null,
        status: "skipped_cooldown",
        mode: currentMode(),
        reason: `cooldown activo (último intento ${recent.executedAt.toISOString()})`,
      };
    }
  }

  // Max attempts por alarma
  const attemptsSoFar = await prisma.remediationAction.count({
    where: { alarmId: alarm.id, status: { in: ["success", "failed"] } },
  });
  if (policy.maxAttempts > 0 && attemptsSoFar >= policy.maxAttempts) {
    await prisma.alarm.update({ where: { id: alarm.id }, data: { requiresHuman: true } });
    return {
      actionId: null,
      status: "escalated_max_attempts",
      mode: currentMode(),
      reason: `máximos ${policy.maxAttempts} intentos alcanzados`,
    };
  }

  const adapter = getVendorAdapter(providerSlug);
  if (!adapter) {
    return {
      actionId: null,
      status: "escalated_no_adapter",
      mode: currentMode(),
      reason: `sin adapter para proveedor ${providerSlug}`,
    };
  }

  const action = mapAlarmToAction(alarm, actionType, alarm.device.externalId);
  if (!action) {
    return {
      actionId: null,
      status: "escalated_unsupported_action",
      mode: currentMode(),
      reason: `action ${actionType} no soportada`,
    };
  }

  const plan = adapter.buildPlan(action);

  const effectiveMode: ExecutionMode = opts.forceDryRun ? "dry_run" : currentMode();

  // Rate limit sólo aplica a live/shadow porque dry_run no llama al middleware
  if (effectiveMode !== "dry_run") {
    const httpSteps = plan.steps.filter((s) => s.kind === "http").length;
    if (!tryConsume(httpSteps)) {
      return {
        actionId: null,
        status: "skipped_rate_limit",
        mode: effectiveMode,
        reason: `presupuesto de rate-limit insuficiente (${httpSteps} req necesarias)`,
      };
    }
  }

  const record = await prisma.remediationAction.create({
    data: {
      alarmId: alarm.id,
      deviceId: alarm.deviceId,
      actionType,
      severity: alarm.severity === "info" ? "low" : alarm.severity === "warning" ? "medium" : "high",
      reason:
        aiReasoning !== null
          ? `IA (conf ${aiConfidence?.toFixed(2)}): ${aiReasoning}`
          : `policy ${policy.alarmType}/${policy.providerSlug ?? "*"} → ${actionType}`,
      status: "executing",
      executionMode: effectiveMode,
      requestPayload: plan as unknown as Prisma.InputJsonValue,
      attempt: attemptsSoFar + 1,
      triggeredBy: aiReasoning !== null ? "ai_agent" : trigger,
    },
  });

  if (effectiveMode === "dry_run") {
    await prisma.remediationAction.update({
      where: { id: record.id },
      data: {
        status: "success",
        responseBody: { simulated: true, reason: "REMEDIATION_MODE=dry_run" } as Prisma.InputJsonValue,
        outcome: "no_change",
        verifiedAt: new Date(),
      },
    });
    return {
      actionId: record.id,
      status: "success",
      mode: effectiveMode,
      plan,
      reason: `plan simulado con ${plan.steps.length} pasos`,
    };
  }

  // live | shadow — dispatch real
  const results: VendorStepResult[] = [];
  let firstOrderId: string | undefined;
  let failed = false;
  for (const step of plan.steps) {
    if (step.kind === "wait") {
      await wait(step.durationMs);
      results.push({ step, ok: true });
      continue;
    }
    try {
      const init: RequestInit = { method: step.method };
      if (step.body !== undefined) init.body = JSON.stringify(step.body);
      const resp = await mw(step.path, init);
      const orderId = adapter.parseOrderId?.(resp);
      if (orderId && !firstOrderId) firstOrderId = orderId;
      results.push({ step, ok: true, response: resp as unknown, orderId });
    } catch (err) {
      const msg =
        err instanceof MiddlewareError ? `MW ${err.status}: ${err.body.slice(0, 200)}` : (err as Error).message;
      results.push({ step, ok: false, error: msg });
      failed = true;
      break;
    }
  }

  const outcome = effectiveMode === "shadow" ? "no_change" : null;
  await prisma.remediationAction.update({
    where: { id: record.id },
    data: {
      status: failed ? "failed" : "success",
      responseBody: {
        orderId: firstOrderId ?? null,
        steps: results.map((r) => ({
          description: r.step.description,
          ok: r.ok,
          error: r.error ?? null,
          orderId: r.orderId ?? null,
        })),
      } as Prisma.InputJsonValue,
      errorMessage: failed ? results.find((r) => !r.ok)?.error ?? "unknown" : null,
      outcome,
    },
  });

  return {
    actionId: record.id,
    status: failed ? "failed" : "success",
    mode: effectiveMode,
    plan,
    reason: failed ? "al menos un paso HTTP falló" : `despachados ${results.filter((r) => r.step.kind === "http").length} pasos`,
  };
}
