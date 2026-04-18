import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { predictForPlant, type TriggerKind } from "@/lib/predictions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const triggerKind = url.searchParams.get("triggerKind"); // filter opcional
  const plantId = url.searchParams.get("plantId");
  const openOnly = url.searchParams.get("openOnly") === "1";

  const where: Record<string, unknown> = {};
  if (triggerKind) where.triggerKind = triggerKind;
  if (plantId) where.device = { plantId };
  if (openOnly) where.outcome = null;

  const rows = await prisma.prediction.findMany({
    where,
    take: 80,
    orderBy: { generatedAt: "desc" },
    include: {
      device: {
        select: {
          id: true,
          externalId: true,
          plant: { select: { id: true, name: true, code: true, client: { select: { name: true } } } },
        },
      },
      outcome: true,
      sourceAlarm: { select: { id: true, severity: true, type: true, message: true } },
      remediations: {
        select: { id: true, commandType: true, status: true, executionMode: true, verifiedOutcome: true },
        orderBy: { proposedAt: "desc" },
        take: 3,
      },
    },
  });
  return NextResponse.json({
    rows: rows.map((r) => ({
      id: r.id,
      predictedType: r.predictedType,
      probability: Number(r.probability),
      daysToEvent: r.daysToEvent ? Number(r.daysToEvent) : null,
      confidence: r.confidence ? Number(r.confidence) : null,
      rootCause: r.rootCause,
      suggestedAction: r.suggestedAction,
      generatedAt: r.generatedAt,
      modelVersion: r.modelVersion,
      triggerKind: r.triggerKind as TriggerKind,
      sourceAlarm: r.sourceAlarm,
      deviceId: r.device.id,
      plant: r.device.plant,
      outcome: r.outcome
        ? {
            status: r.outcome.status,
            decidedAt: r.outcome.decidedAt,
            notes: r.outcome.notes,
          }
        : null,
      remediations: r.remediations,
    })),
  });
}

const postSchema = z.object({
  plantId: z.string().uuid(),
  triggerKind: z.enum(["scheduled", "alarm", "anomaly"]).optional(),
});

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!canWrite(me)) {
    return NextResponse.json({ error: "Tu rol no permite ejecutar predicciones" }, { status: 403 });
  }
  const parsed = postSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "plantId required" }, { status: 400 });
  }
  const plant = await prisma.plant.findUnique({ where: { id: parsed.data.plantId } });
  if (!plant) return NextResponse.json({ error: "plant not found" }, { status: 404 });

  const predictions = await predictForPlant(plant.id, {
    triggerKind: parsed.data.triggerKind ?? "scheduled",
  });
  return NextResponse.json({
    plant: { id: plant.id, name: plant.name, code: plant.code },
    predictions,
  });
}
