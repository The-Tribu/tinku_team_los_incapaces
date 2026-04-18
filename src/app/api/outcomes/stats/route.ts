import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

// Stats agregadas para la vista de predicciones:
//   - total de predicciones cerradas (con outcome)
//   - confirmed (TP), dismissed (FP), auto_matched (TP automático)
//   - accuracy = (confirmed + auto_matched) / total
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const grouped = await prisma.predictionOutcome.groupBy({
    by: ["status"],
    _count: { _all: true },
  });
  const counts: Record<string, number> = {};
  let total = 0;
  for (const row of grouped) {
    counts[row.status] = row._count._all;
    total += row._count._all;
  }
  const matched = (counts["confirmed"] ?? 0) + (counts["auto_matched"] ?? 0);
  const dismissed = counts["dismissed"] ?? 0;
  const openPredictions = await prisma.prediction.count({
    where: { outcome: null, generatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
  });

  return NextResponse.json({
    total,
    confirmed: counts["confirmed"] ?? 0,
    auto_matched: counts["auto_matched"] ?? 0,
    dismissed,
    expired: counts["expired"] ?? 0,
    accuracy: total > 0 ? matched / total : null,
    openPredictions,
  });
}
