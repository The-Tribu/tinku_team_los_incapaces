import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { predictForPlant } from "@/lib/predictions";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const rows = await prisma.prediction.findMany({
    take: 50,
    orderBy: { generatedAt: "desc" },
    include: {
      device: {
        select: {
          externalId: true,
          plant: { select: { id: true, name: true, code: true, client: { select: { name: true } } } },
        },
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
      plant: r.device.plant,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { plantId?: string };
  if (!body.plantId) return NextResponse.json({ error: "plantId required" }, { status: 400 });
  const plant = await prisma.plant.findUnique({ where: { id: body.plantId } });
  if (!plant) return NextResponse.json({ error: "plant not found" }, { status: 404 });

  const predictions = await predictForPlant(body.plantId);
  return NextResponse.json({ plant: { id: plant.id, name: plant.name, code: plant.code }, predictions });
}
