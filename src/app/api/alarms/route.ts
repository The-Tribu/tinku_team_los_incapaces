import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const status = sp.get("status");
  const severity = sp.get("severity");
  const q = sp.get("q");
  const limit = Math.min(Number(sp.get("limit") ?? 20), 200);

  const where: Record<string, unknown> = {};
  if (status === "open") where.resolvedAt = null;
  if (status === "resolved") where.resolvedAt = { not: null };
  if (status === "unack") where.acknowledgedAt = null;
  if (severity) where.severity = severity;
  if (q) {
    where.OR = [
      { message: { contains: q, mode: "insensitive" } },
      { type: { contains: q, mode: "insensitive" } },
      { device: { plant: { name: { contains: q, mode: "insensitive" } } } },
      { device: { plant: { code: { contains: q, mode: "insensitive" } } } },
    ];
  }

  const [alarms, openCount, criticalCount, unackCount] = await Promise.all([
    prisma.alarm.findMany({
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
    }),
    prisma.alarm.count({ where: { resolvedAt: null } }),
    prisma.alarm.count({ where: { resolvedAt: null, severity: "critical" } }),
    prisma.alarm.count({ where: { resolvedAt: null, acknowledgedAt: null } }),
  ]);

  return NextResponse.json({
    counts: { open: openCount, critical: criticalCount, unack: unackCount },
    alarms: alarms.map((a) => ({
      id: a.id,
      severity: a.severity,
      type: a.type,
      source: a.source,
      message: a.message,
      startedAt: a.startedAt,
      resolvedAt: a.resolvedAt,
      acknowledgedAt: a.acknowledgedAt,
      acknowledgedBy: a.acknowledgedBy,
      aiSuggestion: a.aiSuggestion,
      assignee: a.assignee,
      plant: a.device.plant,
      provider: a.device.provider.slug,
      deviceId: a.device.id,
    })),
  });
}
