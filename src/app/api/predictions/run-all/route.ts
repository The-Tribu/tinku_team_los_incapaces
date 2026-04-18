import { NextResponse } from "next/server";
import { canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { runBulkPredictionJob } from "@/lib/prediction-jobs";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ACTIVE_WINDOW_DAYS = 7;

/**
 * Encola una corrida del modelo predictivo sobre todas las plantas "activas"
 * (al menos una lectura en los últimos 7 días). El job corre en background;
 * la UI polea /api/predictions/run-all/[id] para mostrar progreso y recibe
 * la notificación cuando termina (vía el indicator del header).
 */
export async function POST() {
  const me = await getSessionUser();
  if (!me || !canWrite(me)) {
    return NextResponse.json(
      { error: "Tu rol no permite ejecutar predicciones" },
      { status: 403 },
    );
  }

  // Rechaza si ya hay uno corriendo — evita duplicar carga sobre MiniMax.
  const existing = await prisma.predictionJob.findFirst({
    where: { status: { in: ["pending", "running"] }, kind: "run-all" },
  });
  if (existing) {
    return NextResponse.json(
      {
        error: "Ya hay una corrida masiva en curso",
        jobId: existing.id,
      },
      { status: 409 },
    );
  }

  const since = new Date(Date.now() - ACTIVE_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  const active = await prisma.plant.findMany({
    where: {
      devices: {
        some: {
          readings: { some: { ts: { gte: since } } },
        },
      },
    },
    select: { id: true, name: true, code: true },
    orderBy: { name: "asc" },
  });

  const job = await prisma.predictionJob.create({
    data: {
      kind: "run-all",
      status: "pending",
      totalCount: active.length,
      startedBy: me.id,
    },
  });

  // Fire-and-forget: el runner actualiza el row a medida que avanza.
  // No hacemos `await` — devolvemos el jobId al cliente de inmediato.
  runBulkPredictionJob(job.id, active).catch(async (err) => {
    console.error("[run-all] job failed", job.id, err);
    await prisma.predictionJob
      .update({
        where: { id: job.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          error: (err as Error).message.slice(0, 500),
        },
      })
      .catch(() => {});
  });

  return NextResponse.json({
    jobId: job.id,
    totalCount: active.length,
    status: job.status,
  });
}
