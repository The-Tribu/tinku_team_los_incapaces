import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { propose } from "@/lib/remediation";
import type { CommandId } from "@/lib/commands";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  const status = url.searchParams.get("status"); // proposed | approved | executed | ...
  const plantId = url.searchParams.get("plantId");
  const where: Record<string, unknown> = {};
  if (status) where.status = status;
  if (plantId) where.plantId = plantId;

  const rows = await prisma.remediation.findMany({
    where,
    orderBy: { proposedAt: "desc" },
    take: 100,
    include: {
      plant: { select: { id: true, name: true, code: true } },
      device: { select: { externalId: true } },
      alarm: { select: { id: true, type: true, severity: true, message: true } },
      prediction: { select: { id: true, predictedType: true, probability: true } },
    },
  });
  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      plantId: r.plantId,
      plant: r.plant,
      deviceExternalId: r.device?.externalId ?? null,
      commandType: r.commandType,
      reason: r.reason,
      status: r.status,
      executionMode: r.executionMode,
      proposedBy: r.proposedBy,
      proposedAt: r.proposedAt,
      approvedAt: r.approvedAt,
      executedAt: r.executedAt,
      verifiedAt: r.verifiedAt,
      verifiedOutcome: r.verifiedOutcome,
      providerOrderId: r.providerOrderId,
      alarm: r.alarm,
      prediction: r.prediction
        ? { id: r.prediction.id, predictedType: r.prediction.predictedType, probability: Number(r.prediction.probability) }
        : null,
      executionResult: r.executionResult,
    })),
  });
}

const proposeSchema = z.object({
  plantId: z.string().uuid(),
  deviceId: z.string().uuid().optional(),
  commandId: z.string(),
  reason: z.string().min(3).max(300),
  alarmId: z.string().uuid().optional(),
  predictionId: z.string().uuid().optional(),
});

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!canWrite(me)) {
    return NextResponse.json({ error: "Tu rol no permite crear remediaciones" }, { status: 403 });
  }
  const parsed = proposeSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }
  try {
    const rem = await propose({
      ...parsed.data,
      commandId: parsed.data.commandId as CommandId,
      proposedBy: "user",
    });
    return NextResponse.json({ remediation: rem });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}
