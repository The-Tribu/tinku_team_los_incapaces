import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/** Devuelve el estado actual de un job de predicciones masivas (poll). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const job = await prisma.predictionJob.findUnique({ where: { id } });
  if (!job) {
    return NextResponse.json({ error: "Job no encontrado" }, { status: 404 });
  }
  return NextResponse.json({
    id: job.id,
    kind: job.kind,
    status: job.status,
    totalCount: job.totalCount,
    processedCount: job.processedCount,
    successCount: job.successCount,
    failedCount: job.failedCount,
    totalPredictions: job.totalPredictions,
    currentPlant: job.currentPlant,
    startedAt: job.startedAt,
    finishedAt: job.finishedAt,
    error: job.error,
    results: job.results,
  });
}
