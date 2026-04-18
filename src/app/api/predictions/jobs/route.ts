import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

/**
 * Lista jobs recientes. Usado por el indicator del header para:
 *   - Saber si hay alguno `running` y mostrar el spinner.
 *   - Ver los últimos `completed`/`failed` y avisar al usuario cuando
 *     su job termine (aunque haya navegado a otra página).
 */
export async function GET(req: Request) {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  const url = new URL(req.url);
  const activeOnly = url.searchParams.get("active") === "1";
  const limit = Math.min(20, Number(url.searchParams.get("limit") ?? "5"));

  const jobs = await prisma.predictionJob.findMany({
    where: activeOnly
      ? { status: { in: ["pending", "running"] } }
      : undefined,
    orderBy: { startedAt: "desc" },
    take: limit,
    select: {
      id: true,
      kind: true,
      status: true,
      totalCount: true,
      processedCount: true,
      successCount: true,
      failedCount: true,
      totalPredictions: true,
      currentPlant: true,
      startedAt: true,
      finishedAt: true,
      error: true,
    },
  });

  return NextResponse.json({ jobs });
}
