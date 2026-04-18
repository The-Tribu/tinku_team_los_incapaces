import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeReportMetrics, generateNarrative } from "@/lib/reports";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const reports = await prisma.report.findMany({
    take: 50,
    orderBy: { generatedAt: "desc" },
    include: {
      client: { select: { name: true } },
      plant: { select: { name: true, code: true } },
    },
  });
  return NextResponse.json({ reports });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    plantId?: string;
    period?: string;
  };
  if (!body.plantId) return NextResponse.json({ error: "plantId required" }, { status: 400 });

  const plant = await prisma.plant.findUnique({
    where: { id: body.plantId },
    include: { client: true },
  });
  if (!plant) return NextResponse.json({ error: "plant not found" }, { status: 404 });

  const period = body.period ? new Date(body.period) : new Date();
  const metrics = await computeReportMetrics(plant.id, period);

  let narrative = "";
  try {
    narrative = await generateNarrative(plant.name, plant.client.name, metrics);
  } catch (err) {
    narrative = `(Narrativa IA no disponible: ${(err as Error).message})`;
  }

  const periodDay = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
  const report = await prisma.report.create({
    data: {
      clientId: plant.clientId,
      plantId: plant.id,
      period: periodDay,
      status: "sent",
      compliancePct: metrics.compliancePct,
    },
  });

  return NextResponse.json({
    reportId: report.id,
    metrics,
    narrative,
    plant: { name: plant.name, code: plant.code, client: plant.client.name },
  });
}
