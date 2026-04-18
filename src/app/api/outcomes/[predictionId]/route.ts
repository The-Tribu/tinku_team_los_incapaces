import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z.enum(["confirmed", "dismissed"]),
  notes: z.string().max(400).optional(),
});

// Feedback humano sobre una predicción. Se persiste en PredictionOutcome y
// alimenta la memoria RAG del LLM en futuras corridas.
export async function POST(req: NextRequest, { params }: { params: Promise<{ predictionId: string }> }) {
  const me = await getSessionUser();
  if (!canWrite(me)) return NextResponse.json({ error: "unauthorized" }, { status: 403 });
  const { predictionId } = await params;

  const pred = await prisma.prediction.findUnique({ where: { id: predictionId } });
  if (!pred) return NextResponse.json({ error: "prediction not found" }, { status: 404 });

  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.predictionOutcome.findUnique({ where: { predictionId } });
  const data = {
    predictionId,
    status: parsed.data.status,
    notes: parsed.data.notes ?? null,
    decidedBy: me!.id,
    decidedAt: new Date(),
    actualEventAt: parsed.data.status === "confirmed" ? new Date() : existing?.actualEventAt ?? null,
  };
  const saved = existing
    ? await prisma.predictionOutcome.update({ where: { predictionId }, data })
    : await prisma.predictionOutcome.create({ data });
  return NextResponse.json({ outcome: saved });
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ predictionId: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { predictionId } = await params;
  const outcome = await prisma.predictionOutcome.findUnique({ where: { predictionId } });
  return NextResponse.json({ outcome });
}
