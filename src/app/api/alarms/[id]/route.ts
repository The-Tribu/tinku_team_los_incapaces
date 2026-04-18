import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.assignee !== undefined) data.assignee = body.assignee || null;
  if (body.resolve === true) data.resolvedAt = new Date();
  if (body.reopen === true) data.resolvedAt = null;
  const updated = await prisma.alarm.update({ where: { id }, data });
  return NextResponse.json(updated);
}
