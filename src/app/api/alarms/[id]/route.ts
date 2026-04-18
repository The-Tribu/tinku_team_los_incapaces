import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canWrite, getSessionUser } from "@/lib/auth";
import { publishAlarm } from "@/lib/alarm-bus";
import { notifyClientEscalation } from "@/lib/notifications";

export const dynamic = "force-dynamic";

type PatchBody = {
  // Asignación directa (dropdown). Si viene un uuid, validamos contra users.
  assignee?: string | null;
  assignedUserId?: string | null;
  resolve?: boolean;
  reopen?: boolean;
  ack?: boolean;
  // Aceptar = ack + auto-asignar al operador actual.
  accept?: boolean;
  // Escalar a cliente: envía correo + registra escalatedAt/By/Note.
  escalate?: { note?: string } | true;
};

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  const data: Record<string, unknown> = {};
  let escalationPayload: { note?: string } | null = null;
  let escalationResult: Awaited<ReturnType<typeof notifyClientEscalation>> | null = null;

  // Asignación explícita: si viene assignedUserId resolvemos el nombre;
  // si viene solo assignee (texto libre) lo dejamos sin uuid.
  if (body.assignedUserId !== undefined) {
    if (body.assignedUserId) {
      const target = await prisma.user.findUnique({
        where: { id: body.assignedUserId },
        select: { id: true, name: true, active: true },
      });
      if (!target || !target.active) {
        return NextResponse.json({ error: "invalid_assignee" }, { status: 400 });
      }
      data.assignedUserId = target.id;
      data.assignee = target.name;
    } else {
      data.assignedUserId = null;
      data.assignee = null;
    }
  } else if (body.assignee !== undefined) {
    data.assignee = body.assignee || null;
    data.assignedUserId = null;
  }

  if (body.resolve === true) data.resolvedAt = new Date();
  if (body.reopen === true) {
    data.resolvedAt = null;
    data.acknowledgedAt = null;
    data.acknowledgedBy = null;
  }

  if (body.ack === true || body.accept === true) {
    data.acknowledgedAt = new Date();
    data.acknowledgedBy = user.id;
  }

  // Accept = auto-asignar al operador actual si la alarma no tiene dueño.
  if (body.accept === true) {
    const existing = await prisma.alarm.findUnique({
      where: { id },
      select: { assignedUserId: true, assignee: true },
    });
    if (!existing?.assignedUserId && !existing?.assignee) {
      data.assignedUserId = user.id;
      data.assignee = user.name;
    }
  }

  if (body.escalate) {
    escalationPayload = body.escalate === true ? {} : { note: body.escalate.note };
    data.escalatedAt = new Date();
    data.escalatedBy = user.id;
    data.escalationNote = escalationPayload.note?.trim() || null;
    // Al escalar, también damos ack automáticamente.
    if (!data.acknowledgedAt) {
      data.acknowledgedAt = new Date();
      data.acknowledgedBy = user.id;
    }
  }

  const updated = await prisma.alarm.update({
    where: { id },
    data,
    include: {
      device: {
        include: {
          plant: { select: { id: true, name: true, code: true } },
          provider: { select: { slug: true } },
        },
      },
    },
  });

  // Fire-and-forget del escalamiento: no bloqueamos la respuesta si el
  // correo tarda. Pero sí esperamos brevemente para devolver el status.
  if (escalationPayload) {
    escalationResult = await notifyClientEscalation(updated.id, {
      note: escalationPayload.note,
      escalatedBy: { id: user.id, name: user.name, email: user.email },
    });
  }

  const kind: "new" | "resolved" | "ack" = body.resolve === true
    ? "resolved"
    : body.ack === true || body.accept === true || !!body.escalate
      ? "ack"
      : "new";

  publishAlarm({
    id: updated.id,
    deviceId: updated.deviceId,
    plantId: updated.device.plant.id,
    plantName: updated.device.plant.name,
    plantCode: updated.device.plant.code,
    provider: updated.device.provider.slug,
    severity: updated.severity as "critical" | "warning" | "info",
    type: updated.type,
    source: updated.source,
    message: updated.message,
    startedAt: updated.startedAt.toISOString(),
    kind,
  });

  return NextResponse.json({
    alarm: updated,
    escalation: escalationResult,
  });
}
