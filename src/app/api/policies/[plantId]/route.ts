import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canAdmin, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getOrCreatePolicy, sanitizeCommands, toPolicyView } from "@/lib/policies";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ plantId: string }> }) {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { plantId } = await params;
  const plant = await prisma.plant.findUnique({ where: { id: plantId }, select: { id: true, name: true, code: true } });
  if (!plant) return NextResponse.json({ error: "plant not found" }, { status: 404 });
  const row = await getOrCreatePolicy(plantId);
  return NextResponse.json({ plant, policy: toPolicyView(row) });
}

const updateSchema = z.object({
  autonomyLevel: z.enum(["manual", "approval", "auto"]),
  executionMode: z.enum(["mock", "real"]),
  allowedCommands: z.array(z.string()).max(20),
  requiredApproverRole: z.enum(["admin", "ops"]),
  maxActionsPerDay: z.number().int().min(0).max(500),
  notes: z.string().max(500).nullable().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: Promise<{ plantId: string }> }) {
  const me = await getSessionUser();
  if (!canAdmin(me)) {
    return NextResponse.json({ error: "Solo admins pueden modificar políticas" }, { status: 403 });
  }
  const { plantId } = await params;
  const plant = await prisma.plant.findUnique({ where: { id: plantId }, select: { id: true } });
  if (!plant) return NextResponse.json({ error: "plant not found" }, { status: 404 });

  const parsed = updateSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "validation failed", issues: parsed.error.flatten() }, { status: 400 });
  }
  const cleaned = sanitizeCommands(parsed.data.allowedCommands);
  // Si sube a auto con comandos vacíos, forzamos approval — la auto-ejecución
  // sin comandos permitidos no tiene sentido.
  const autonomyLevel =
    parsed.data.autonomyLevel === "auto" && cleaned.length === 0 ? "approval" : parsed.data.autonomyLevel;

  await getOrCreatePolicy(plantId);
  const updated = await prisma.plantAutomationPolicy.update({
    where: { plantId },
    data: {
      autonomyLevel,
      executionMode: parsed.data.executionMode,
      allowedCommands: cleaned,
      requiredApproverRole: parsed.data.requiredApproverRole,
      maxActionsPerDay: parsed.data.maxActionsPerDay,
      notes: parsed.data.notes ?? null,
      updatedBy: me!.id,
    },
  });
  return NextResponse.json({ policy: toPolicyView(updated) });
}
