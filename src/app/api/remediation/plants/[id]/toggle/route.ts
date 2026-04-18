import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { enabled?: boolean };
  const plant = await prisma.plant.findUnique({ where: { id }, select: { autoRemediationEnabled: true } });
  if (!plant) return NextResponse.json({ error: "plant not found" }, { status: 404 });
  const next = typeof body.enabled === "boolean" ? body.enabled : !plant.autoRemediationEnabled;
  const updated = await prisma.plant.update({
    where: { id },
    data: { autoRemediationEnabled: next },
    select: { id: true, autoRemediationEnabled: true },
  });
  return NextResponse.json({ plant: updated });
}
