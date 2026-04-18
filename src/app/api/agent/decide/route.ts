import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { decideRemediation, linkAgentDecisionToRemediation } from "@/lib/agent";
import { propose } from "@/lib/remediation";
import { getOrCreatePolicy, toPolicyView } from "@/lib/policies";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const schema = z.object({
  alarmId: z.string().uuid(),
  // Si true, además de decidir, ejecuta el propose() (respeta política de aprobación).
  // Si false, solo devuelve la decisión sin tocar Remediation.
  apply: z.boolean().default(false),
});

/**
 * Disparo manual del agente desde la UI (panel de alarma).
 * Útil para demo: el operador clickea "Pedir al agente" y obtiene la decisión
 * con su rationale, opcionalmente convertida en Remediation.
 */
export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!canWrite(me)) {
    return NextResponse.json({ error: "rol insuficiente" }, { status: 403 });
  }
  const parsed = schema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "validation failed", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const alarm = await prisma.alarm.findUnique({
    where: { id: parsed.data.alarmId },
    include: {
      device: {
        include: {
          plant: { select: { id: true, name: true, code: true, capacityKwp: true } },
          provider: { select: { slug: true } },
        },
      },
    },
  });
  if (!alarm) return NextResponse.json({ error: "alarm not found" }, { status: 404 });
  if (alarm.resolvedAt) {
    return NextResponse.json({ error: "alarm already resolved" }, { status: 400 });
  }

  const policy = toPolicyView(await getOrCreatePolicy(alarm.device.plant.id));

  const decision = await decideRemediation({
    alarm: {
      id: alarm.id,
      type: alarm.type,
      severity: alarm.severity as "critical" | "warning" | "info",
      source: alarm.source,
      message: alarm.message,
      startedAt: alarm.startedAt,
    },
    plant: {
      id: alarm.device.plant.id,
      name: alarm.device.plant.name,
      code: alarm.device.plant.code,
      capacityKwp: alarm.device.plant.capacityKwp ? Number(alarm.device.plant.capacityKwp) : null,
    },
    device: {
      id: alarm.device.id,
      externalId: alarm.device.externalId,
      providerSlug: alarm.device.provider.slug,
      kind: alarm.device.kind,
      currentStatus: alarm.device.currentStatus,
    },
    policy,
  });

  let remediationId: string | null = null;
  if (parsed.data.apply && decision.action === "propose") {
    try {
      const rem = await propose({
        plantId: alarm.device.plant.id,
        deviceId: alarm.device.id,
        deviceExternalId: alarm.device.externalId,
        commandId: decision.commandId,
        reason: `[agente manual${decision.llmUsed ? "+LLM" : ""}] ${decision.rationale}`,
        alarmId: alarm.id,
        proposedBy: "ai",
        aiConfidence: decision.confidence,
      });
      remediationId = rem.id;
      await linkAgentDecisionToRemediation(decision.decisionId, rem.id);
    } catch (err) {
      return NextResponse.json(
        {
          decision,
          applyError: (err as Error).message,
        },
        { status: 200 },
      );
    }
  }

  return NextResponse.json({ decision, remediationId });
}
