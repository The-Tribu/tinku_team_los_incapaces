/**
 * SunHub · Remediation lifecycle + executor.
 *
 * Flujo:
 *   1. `propose()` crea una Remediation en estado `proposed` a partir de
 *      (alarma | predicción, comando). Auto-aprueba si la política lo permite.
 *   2. `approve()` marca approved por un user.
 *   3. `execute()` dispara el comando:
 *      - executionMode=mock → escribe audit + result simulado, status=executed.
 *      - executionMode=real → POST al middleware (`/<provider>/v1.0/order/...`),
 *        captura respuesta tal cual. Si hay `orderId` queda en providerOrderId
 *        para consultar GET /v1.0/order/{id} en `verify()`.
 *   4. `verify()` llama al GET de la orden (solo Deye por ahora) y marca
 *      verifiedOutcome = success|partial|no_effect.
 *
 * Todo se refleja en RemediationAudit para trazabilidad.
 */
import { prisma } from "./prisma";
import { mw, MiddlewareError } from "./middleware";
import { COMMANDS, getCommand, type CommandId } from "./commands";
import {
  canExecuteToday,
  getOrCreatePolicy,
  toPolicyView,
  type ExecutionMode,
} from "./policies";

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
};

export async function propose(input: ProposeArgs) {
  const cmd = getCommand(input.commandId);
  if (!cmd) throw new Error(`unknown command ${input.commandId}`);
  if (!input.deviceExternalId && input.deviceId) {
    const d = await prisma.device.findUnique({
      where: { id: input.deviceId },
      select: { externalId: true },
    });
    input.deviceExternalId = d?.externalId ?? null;
  }
  const payload = cmd.buildPayload(input.deviceExternalId ?? "unknown", input.args);
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
    },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId: rem.id,
      event: "proposed",
      actorKind: input.proposedBy === "user" ? "user" : "ai",
      payload: { commandId: input.commandId, reason: input.reason },
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

type ExecuteOpts = {
  userId?: string | null;
  // Override explícito del modo. Si no se pasa, se toma de la política.
  executionMode?: ExecutionMode;
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

  const policyCheck = await canExecuteToday(rem.plantId, rem.commandType);
  if (!policyCheck.ok) throw new Error(`política bloquea ejecución: ${policyCheck.reason}`);

  const mode: ExecutionMode = opts.executionMode ?? policyCheck.policy.executionMode;
  const deviceExternalId = rem.device?.externalId ?? "unknown";
  const providerSlug = rem.device?.provider.slug ?? "deye";
  const endpointPath = cmd.endpointPath(deviceExternalId).replace("/deye/", `/${providerSlug}/`);

  await prisma.remediation.update({
    where: { id: remediationId },
    data: { status: "executing", executedBy: opts.userId ?? null, executionMode: mode },
  });

  let result: Record<string, unknown>;
  let nextStatus: "executed" | "failed" = "executed";
  let providerOrderId: string | null = null;

  if (mode === "mock") {
    // Simulación: no golpeamos el middleware. Generamos orderId sintético para
    // que la UI muestre algo consistente y la auditoría quede cerrada.
    providerOrderId = `mock-${Date.now().toString(36)}`;
    result = {
      simulated: true,
      endpoint: endpointPath,
      payload: rem.commandPayload,
      providerOrderId,
      message: "Ejecución simulada — no se envió comando al dispositivo.",
    };
  } else {
    try {
      const raw = await mw<Record<string, unknown>>(endpointPath, {
        method: "POST",
        body: JSON.stringify(rem.commandPayload),
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
      // Si el middleware responde con success=false lo marcamos como failed.
      if (raw && typeof raw === "object" && "success" in raw && raw.success === false) {
        nextStatus = "failed";
      }
    } catch (err) {
      nextStatus = "failed";
      if (err instanceof MiddlewareError) {
        result = {
          simulated: false,
          endpoint: endpointPath,
          error: `MW ${err.status}`,
          body: err.body.slice(0, 500),
          note:
            "El middleware del hackathon no expone endpoints de escritura, por eso un 4xx aquí es esperado.",
        };
      } else {
        result = {
          simulated: false,
          endpoint: endpointPath,
          error: (err as Error).message,
        };
      }
    }
  }

  const updated = await prisma.remediation.update({
    where: { id: remediationId },
    data: {
      status: nextStatus,
      executedAt: new Date(),
      providerOrderId,
      executionResult: result as object,
    },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId,
      event: nextStatus === "executed" ? "executed" : "failed",
      actorUserId: opts.userId ?? null,
      actorKind: opts.userId ? "user" : "system",
      payload: { mode, endpoint: endpointPath, summary: summaryFor(result) },
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
