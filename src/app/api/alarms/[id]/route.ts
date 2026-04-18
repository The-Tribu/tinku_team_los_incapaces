import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { publishAlarm } from "@/lib/alarm-bus";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.assignee !== undefined) data.assignee = body.assignee || null;
  if (body.resolve === true) data.resolvedAt = new Date();
  if (body.reopen === true) {
    data.resolvedAt = null;
    data.acknowledgedAt = null;
    data.acknowledgedBy = null;
  }
  if (body.ack === true) {
    data.acknowledgedAt = new Date();
    data.acknowledgedBy = user.id;
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

  const kind: "new" | "resolved" | "ack" = body.resolve === true
    ? "resolved"
    : body.ack === true
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

  return NextResponse.json(updated);
}
