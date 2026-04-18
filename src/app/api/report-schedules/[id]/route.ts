import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { computeNextRunAt, isCadence } from "@/lib/report-schedules";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });
  await prisma.reportSchedule.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const existing = await prisma.reportSchedule.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "not found" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    active?: boolean;
    title?: string;
    cadence?: string;
    dayOfMonth?: number | null;
    dayOfWeek?: number | null;
    hour?: number;
    minute?: number;
    recipientEmail?: string | null;
  };

  const data: Record<string, unknown> = {};
  if (typeof body.active === "boolean") data.active = body.active;
  if (typeof body.title === "string" && body.title.trim()) data.title = body.title.trim();
  if (typeof body.recipientEmail !== "undefined") {
    data.recipientEmail = body.recipientEmail?.trim() || null;
  }

  let cadenceChanged = false;
  if (typeof body.cadence === "string") {
    if (!isCadence(body.cadence)) {
      return NextResponse.json({ error: "invalid cadence" }, { status: 400 });
    }
    data.cadence = body.cadence;
    cadenceChanged = true;
  }
  if (typeof body.hour === "number") data.hour = Math.max(0, Math.min(23, body.hour));
  if (typeof body.minute === "number") data.minute = Math.max(0, Math.min(59, body.minute));
  if (body.dayOfMonth !== undefined) {
    data.dayOfMonth =
      body.dayOfMonth === null ? null : Math.max(1, Math.min(28, body.dayOfMonth));
  }
  if (body.dayOfWeek !== undefined) {
    data.dayOfWeek =
      body.dayOfWeek === null ? null : Math.max(0, Math.min(6, body.dayOfWeek));
  }

  if (cadenceChanged || "hour" in data || "minute" in data || "dayOfMonth" in data || "dayOfWeek" in data) {
    const merged = { ...existing, ...data } as typeof existing;
    data.nextRunAt = computeNextRunAt(merged, new Date());
  }

  const updated = await prisma.reportSchedule.update({ where: { id }, data });
  return NextResponse.json({ id: updated.id });
}
