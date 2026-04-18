import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const limit = Number(sp.get("limit") ?? 20);

  const where: Record<string, unknown> = {};
  if (status === "open") where.resolvedAt = null;
  if (status === "resolved") where.resolvedAt = { not: null };

  const alarms = await prisma.alarm.findMany({
    where,
    take: limit,
    orderBy: { startedAt: "desc" },
    include: {
      device: {
        select: {
          id: true,
          externalId: true,
          plant: { select: { id: true, name: true, code: true } },
          provider: { select: { slug: true } },
        },
      },
    },
  });

  return NextResponse.json({
    alarms: alarms.map((a) => ({
      id: a.id,
      severity: a.severity,
      type: a.type,
      message: a.message,
      startedAt: a.startedAt,
      resolvedAt: a.resolvedAt,
      aiSuggestion: a.aiSuggestion,
      assignee: a.assignee,
      plant: a.device.plant,
      provider: a.device.provider.slug,
      deviceId: a.device.id,
    })),
  });
}
