import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    enabled?: boolean;
    cooldownMin?: number;
    maxAttempts?: number;
    requiresHuman?: boolean;
    requiresAiDecision?: boolean;
  };
  const data: Record<string, unknown> = {};
  if (typeof body.enabled === "boolean") data.enabled = body.enabled;
  if (typeof body.cooldownMin === "number") data.cooldownMin = Math.max(0, Math.floor(body.cooldownMin));
  if (typeof body.maxAttempts === "number") data.maxAttempts = Math.max(0, Math.floor(body.maxAttempts));
  if (typeof body.requiresHuman === "boolean") data.requiresHuman = body.requiresHuman;
  if (typeof body.requiresAiDecision === "boolean") data.requiresAiDecision = body.requiresAiDecision;

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "no updatable fields" }, { status: 400 });
  }

  const updated = await prisma.remediationPolicy.update({ where: { id }, data });
  return NextResponse.json({ policy: updated });
}
