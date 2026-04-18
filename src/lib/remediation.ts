/**
 * SunHub · Remediation lifecycle + executor.
 *
 * Flujo:
 *   1. `propose()` crea una Remediation en estado `proposed` a partir de
 *      (alarma | predicción, comando). Auto-aprueba si la política lo permite.
 *   2. `approve()` marca approved por un user.
 *   3. `execute()` dispara el comando:
 *      - executionMode=mock → escribe audit + result simulado, status=executed.
 *      - executionMode=real → POST al middleware (`/<provider>/.../order/...`),
 *        captura respuesta tal cual. Si hay `orderId` queda en providerOrderId
 *        para consultar GET /v1.0/order/{id} en `verify()`.
 *   4. `verify()` llama al GET de la orden (solo Deye por ahora) y marca
 *      verifiedOutcome = success|partial|no_effect.
 *   5. `cancel()` cierra una proposed cuando la alarma origen se autorresolvió.
 *   6. `markForRetry()` programa nextRetryAt para que el repair worker
 *      reintente una failed por causas transitorias (rate-limit, timeout).
 *
 * Todo se refleja en RemediationAudit para trazabilidad.
 */
import { prisma } from "./prisma";
import { mw, MiddlewareError, MiddlewareRateLimitError } from "./middleware";
import { getCommand, type CommandId } from "./commands";
import {
  canExecuteToday,
  getOrCreatePolicy,
  toPolicyView,
  type ExecutionMode,
} from "./policies";

const MAX_RETRIES = Number(process.env.REPAIR_MAX_RETRIES ?? 3);

type ProposeArgs = {
  plantId: string;
  deviceId?: string | null;
  deviceExternalId?: string | null;
  commandId: CommandId;
  reason: string;
  alarmId?: string | null;
  predictionId?: string | null;
  proposedBy?: "ai" | "user";
  args?: Record<string, unknown>;
  /** Confianza con la que el agente propuso (solo si proposedBy=ai). */
  aiConfidence?: number | null;
};

export async function propose(input: ProposeArgs) {
  const cmd = getCommand(input.commandId);
  if (!cmd) throw new Error(`unknown command ${input.commandId}`);

  let providerSlug: string | null = null;
  if (input.deviceId) {
    const d = await prisma.device.findUnique({
      where: { id: input.deviceId },
      select: { externalId: true, provider: { select: { slug: true } } },
    });
    if (!input.deviceExternalId) input.deviceExternalId = d?.externalId ?? null;
    providerSlug = d?.provider.slug ?? null;
  }

  // Si conocemos el proveedor, validamos que el comando lo soporte. Sin esto
  // proponemos algo que ni siquiera tiene endpoint y queda en audit como ruido.
  if (providerSlug && !cmd.supportedProviders.includes(providerSlug)) {
    throw new Error(
      `comando ${input.commandId} no es soportado para ${providerSlug} (soportados: ${cmd.supportedProviders.join(", ") || "ninguno"})`,
    );
  }

  // Construimos el payload de muestra (lo real se reconstruye en execute() con
  // el slug del device para asegurar coherencia si el device cambió de proveedor).
  const sample = cmd.build(input.deviceExternalId ?? "unknown", providerSlug ?? "deye", input.args);
  const payload = sample?.payload ?? { commandId: input.commandId, args: input.args ?? {} };

  const rem = await prisma.remediation.create({
    data: {
      plantId: input.plantId,
      deviceId: input.deviceId ?? null,
      predictionId: input.predictionId ?? null,
      alarmId: input.alarmId ?? null,
      commandType: input.commandId,
      commandPayload: payload as object,
      reason: input.reason,
      status: "proposed",
      proposedBy: input.proposedBy ?? "ai",
      aiConfidence:
        typeof input.aiConfidence === "number" && Number.isFinite(input.aiConfidence)
          ? input.aiConfidence
          : null,
    },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId: rem.id,
      event: "proposed",
      actorKind: input.proposedBy === "user" ? "user" : "ai",
      payload: {
        commandId: input.commandId,
        reason: input.reason,
        aiConfidence: input.aiConfidence ?? null,
      },
    },
  });

  // Auto-aprobación si política = auto y comando permitido.
  const policyRow = await getOrCreatePolicy(input.plantId);
  const policy = toPolicyView(policyRow);
  if (policy.autonomyLevel === "auto" && policy.allowedCommands.includes(input.commandId)) {
    return approve(rem.id, null, "system");
  }
  return rem;
}

export async function approve(
  remediationId: string,
  userId: string | null,
  actorKind: "user" | "system" = "user",
) {
  const rem = await prisma.remediation.findUnique({ where: { id: remediationId } });
  if (!rem) throw new Error("remediation not found");
  if (rem.status !== "proposed") {
    throw new Error(`no se puede aprobar, estado=${rem.status}`);
  }
  const updated = await prisma.remediation.update({
    where: { id: remediationId },
    data: {
      status: "approved",
      approvedBy: userId,
      approvedAt: new Date(),
    },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId,
      event: "approved",
      actorUserId: userId,
      actorKind,
    },
  });
  return updated;
}

export async function reject(remediationId: string, userId: string, reason: string) {
  const rem = await prisma.remediation.findUnique({ where: { id: remediationId } });
  if (!rem) throw new Error("remediation not found");
  if (rem.status !== "proposed" && rem.status !== "approved") {
    throw new Error(`no se puede rechazar, estado=${rem.status}`);
  }
  const updated = await prisma.remediation.update({
    where: { id: remediationId },
    data: {
      status: "rejected",
      rejectedBy: userId,
      rejectedAt: new Date(),
      rejectedReason: reason,
    },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId,
      event: "rejected",
      actorUserId: userId,
      actorKind: "user",
      payload: { reason },
    },
  });
  return updated;
}

/**
 * Cancela una remediación que aún no se ejecutó. Útil cuando la alarma
 * origen se autorresuelve antes de que el operador apruebe / antes de que
 * el repair worker la levante.
 */
export async function cancel(
  remediationId: string,
  userId: string | null,
  reason: string,
  actorKind: "user" | "system" = "user",
) {
  const rem = await prisma.remediation.findUnique({ where: { id: remediationId } });
  if (!rem) throw new Error("remediation not found");
  if (rem.status !== "proposed" && rem.status !== "approved") {
    throw new Error(`no se puede cancelar, estado=${rem.status}`);
  }
  const updated = await prisma.remediation.update({
    where: { id: remediationId },
    data: {
      status: "cancelled",
      cancelledAt: new Date(),
      cancelledBy: userId,
      cancelledReason: reason,
    },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId,
      event: "cancelled",
      actorUserId: userId,
      actorKind,
      payload: { reason },
    },
  });
  return updated;
}

type ExecuteOpts = {
  userId?: string | null;
  /** Override explícito del modo. Si no se pasa, se toma de la política. */
  executionMode?: ExecutionMode;
  /** Si true, marca como retry en el audit (lo usa el repair worker). */
  isRetry?: boolean;
};

export async function execute(remediationId: string, opts: ExecuteOpts = {}) {
  const rem = await prisma.remediation.findUnique({
    where: { id: remediationId },
    include: {
      device: { select: { externalId: true, provider: { select: { slug: true } } } },
    },
  });
  if (!rem) throw new Error("remediation not found");
  if (rem.status !== "approved") throw new Error(`debe estar approved, estado=${rem.status}`);

  const cmd = getCommand(rem.commandType);
  if (!cmd) throw new Error(`comando desconocido ${rem.commandType}`);

  const providerSlug = rem.device?.provider.slug ?? "deye";

  const policyCheck = await canExecuteToday(rem.plantId, rem.commandType, { providerSlug });
  if (!policyCheck.ok) throw new Error(`política bloquea ejecución: ${policyCheck.reason}`);

  const mode: ExecutionMode = opts.executionMode ?? policyCheck.policy.executionMode;
  const deviceExternalId = rem.device?.externalId ?? "unknown";

  const built = cmd.build(deviceExternalId, providerSlug);
  if (!built) {
    throw new Error(
      `comando ${rem.commandType} no soportado por proveedor ${providerSlug}`,
    );
  }
  const endpointPath = built.path;
  const livePayload = built.payload;

  await prisma.remediation.update({
    where: { id: remediationId },
    data: {
      status: "executing",
      executedBy: opts.userId ?? null,
      executionMode: mode,
      // Reseteamos nextRetryAt al iniciar este intento.
      nextRetryAt: null,
    },
  });

  let result: Record<string, unknown>;
  let nextStatus: "executed" | "failed" = "executed";
  let providerOrderId: string | null = null;
  let transientError = false;

  if (mode === "mock") {
    providerOrderId = `mock-${Date.now().toString(36)}`;
    result = {
      simulated: true,
      endpoint: endpointPath,
      payload: livePayload,
      providerOrderId,
      message: "Ejecución simulada — no se envió comando al dispositivo.",
    };
  } else {
    try {
      const raw = await mw<Record<string, unknown>>(endpointPath, {
        method: "POST",
        body: JSON.stringify(livePayload),
      });
      providerOrderId =
        typeof raw?.orderId === "string"
          ? raw.orderId
          : typeof raw?.order_id === "string"
            ? (raw.order_id as string)
            : null;
      result = {
        simulated: false,
        endpoint: endpointPath,
        response: raw,
        providerOrderId,
      };
      if (raw && typeof raw === "object" && "success" in raw && raw.success === false) {
        nextStatus = "failed";
      }
    } catch (err) {
      nextStatus = "failed";
      if (err instanceof MiddlewareRateLimitError) {
        transientError = true;
        result = {
          simulated: false,
          endpoint: endpointPath,
          error: `rate-limited`,
          retryAfterSec: err.retryAfterSec,
          body: err.body.slice(0, 500),
        };
      } else if (err instanceof MiddlewareError) {
        // 5xx también lo consideramos transitorio (vale la pena reintentar).
        if (err.status >= 500) transientError = true;
        result = {
          simulated: false,
          endpoint: endpointPath,
          error: `MW ${err.status}`,
          body: err.body.slice(0, 500),
          note:
            "El middleware del hackathon no expone endpoints de escritura, por eso un 4xx aquí es esperado.",
        };
      } else {
        transientError = true;
        result = {
          simulated: false,
          endpoint: endpointPath,
          error: (err as Error).message,
        };
      }
    }
  }

  // Calcular nextRetryAt si fue failed transitorio y no excedimos cap.
  let nextRetryAt: Date | null = null;
  let retryCount = rem.retryCount;
  if (nextStatus === "failed" && transientError && retryCount < MAX_RETRIES) {
    retryCount += 1;
    // backoff exponencial: 2^n minutos, cap 30min
    const minutes = Math.min(30, 2 ** retryCount);
    nextRetryAt = new Date(Date.now() + minutes * 60_000);
  }

  const updated = await prisma.remediation.update({
    where: { id: remediationId },
    data: {
      status: nextStatus,
      executedAt: new Date(),
      providerOrderId,
      executionResult: result as object,
      retryCount,
      nextRetryAt,
    },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId,
      event: nextStatus === "executed" ? "executed" : "failed",
      actorUserId: opts.userId ?? null,
      actorKind: opts.userId ? "user" : "system",
      payload: {
        mode,
        endpoint: endpointPath,
        summary: summaryFor(result),
        isRetry: opts.isRetry ?? false,
        retryCount,
        nextRetryAt: nextRetryAt?.toISOString() ?? null,
      },
    },
  });
  return updated;
}

function summaryFor(result: Record<string, unknown>): string {
  if ((result as { simulated?: boolean }).simulated) return "simulado";
  if ((result as { error?: string }).error) return String((result as { error?: string }).error);
  return "ok";
}

/**
 * Verifica el resultado de una orden real consultando GET /v1.0/order/{id}.
 * En mock pura escribe verifiedOutcome=success.
 */
export async function verify(remediationId: string) {
  const rem = await prisma.remediation.findUnique({
    where: { id: remediationId },
    include: { device: { select: { provider: { select: { slug: true } } } } },
  });
  if (!rem) throw new Error("remediation not found");
  if (rem.status !== "executed") throw new Error(`estado=${rem.status}, no se puede verificar`);

  let outcome: "success" | "partial" | "no_effect" = "success";
  let detail: unknown = null;

  if (rem.executionMode === "real" && rem.providerOrderId && rem.device?.provider.slug === "deye") {
    try {
      detail = await mw(`/deye/v1.0/order/${rem.providerOrderId}`, { method: "GET" });
      const d = detail as { status?: string; result?: string };
      if (d.status === "SUCCESS" || d.result === "ok") outcome = "success";
      else if (d.status === "PARTIAL") outcome = "partial";
      else outcome = "no_effect";
    } catch (err) {
      outcome = "no_effect";
      detail = { error: (err as Error).message };
    }
  }

  const updated = await prisma.remediation.update({
    where: { id: remediationId },
    data: { verifiedAt: new Date(), verifiedOutcome: outcome },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId,
      event: "verified",
      actorKind: "system",
      payload: { outcome, detail: detail as object | null } as object,
    },
  });
  return updated;
}

/**
 * Re-aprueba una remediación failed para que el repair worker la reejecute.
 * Solo aplica si retryCount < MAX_RETRIES y nextRetryAt está vencido.
 */
export async function markForRetry(remediationId: string) {
  const rem = await prisma.remediation.findUnique({ where: { id: remediationId } });
  if (!rem) throw new Error("remediation not found");
  if (rem.status !== "failed") throw new Error(`solo failed se reintenta, estado=${rem.status}`);
  if (rem.retryCount >= MAX_RETRIES) throw new Error("max retries alcanzado");

  const updated = await prisma.remediation.update({
    where: { id: remediationId },
    data: { status: "approved" },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId,
      event: "approved",
      actorKind: "system",
      payload: { reason: "retry-scheduled", retryCount: rem.retryCount },
    },
  });
  return updated;
}
