import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const alarmId = sp.get("alarmId");
  const deviceId = sp.get("deviceId");
  const limit = Math.min(200, Number(sp.get("limit") ?? 50));

  const where: Record<string, unknown> = {};
  if (alarmId) where.alarmId = alarmId;
  if (deviceId) where.deviceId = deviceId;

  const rows = await prisma.remediationAction.findMany({
    where,
    take: limit,
    orderBy: { executedAt: "desc" },
    include: {
      device: {
        select: {
          id: true,
          externalId: true,
          plant: { select: { id: true, name: true, code: true } },
          provider: { select: { slug: true, displayName: true } },
        },
      },
      alarm: {
        select: { id: true, type: true, severity: true, message: true, resolvedAt: true },
      },
    },
  });

  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      alarmId: r.alarmId,
      deviceId: r.deviceId,
      actionType: r.actionType,
      severity: r.severity,
      reason: r.reason,
      status: r.status,
      executionMode: r.executionMode,
      attempt: r.attempt,
      triggeredBy: r.triggeredBy,
      outcome: r.outcome,
      executedAt: r.executedAt,
      verifiedAt: r.verifiedAt,
      errorMessage: r.errorMessage,
      requestPayload: r.requestPayload,
      responseBody: r.responseBody,
      device: r.device,
      alarm: r.alarm,
    })),
  });
}
