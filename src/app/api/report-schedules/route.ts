import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeNextRunAt,
  describeCadence,
  describeNextRun,
  isCadence,
} from "@/lib/report-schedules";

export const dynamic = "force-dynamic";

export async function GET() {
  const schedules = await prisma.reportSchedule.findMany({
    orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
    include: {
      plant: { select: { name: true, code: true } },
      client: { select: { name: true } },
    },
  });
  return NextResponse.json({
    schedules: schedules.map((s) => ({
      id: s.id,
      title: s.title,
      cadence: s.cadence,
      cadenceLabel: describeCadence(s),
      dayOfMonth: s.dayOfMonth,
      dayOfWeek: s.dayOfWeek,
      hour: s.hour,
      minute: s.minute,
      recipientEmail: s.recipientEmail,
      active: s.active,
      nextRunAt: s.nextRunAt?.toISOString() ?? null,
      nextRunLabel: s.nextRunAt ? describeNextRun(s.nextRunAt) : "—",
      lastRunAt: s.lastRunAt?.toISOString() ?? null,
      lastStatus: s.lastStatus,
      lastError: s.lastError,
      plant: s.plant ? { name: s.plant.name, code: s.plant.code } : null,
      client: s.client ? { name: s.client.name } : null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    plantId?: string;
    clientId?: string;
    cadence?: string;
    dayOfMonth?: number;
    dayOfWeek?: number;
    hour?: number;
    minute?: number;
    recipientEmail?: string;
  };

  if (!body.title || body.title.trim().length === 0) {
    return NextResponse.json({ error: "title required" }, { status: 400 });
  }
  if (!isCadence(body.cadence)) {
    return NextResponse.json(
      { error: "cadence must be monthly | weekly | biweekly | quarterly" },
      { status: 400 },
    );
  }

  let plantId = body.plantId ?? null;
  let clientId = body.clientId ?? null;

  if (plantId) {
    const plant = await prisma.plant.findUnique({
      where: { id: plantId },
      select: { id: true, clientId: true },
    });
    if (!plant) return NextResponse.json({ error: "plant not found" }, { status: 404 });
    clientId = plant.clientId;
  } else if (clientId) {
    const client = await prisma.client.findUnique({
      where: { id: clientId },
      select: { id: true },
    });
    if (!client) return NextResponse.json({ error: "client not found" }, { status: 404 });
  } else {
    return NextResponse.json({ error: "plantId or clientId required" }, { status: 400 });
  }

  const hour = Number.isInteger(body.hour) ? Math.max(0, Math.min(23, body.hour!)) : 7;
  const minute = Number.isInteger(body.minute) ? Math.max(0, Math.min(59, body.minute!)) : 0;
  const dayOfMonth =
    body.cadence === "monthly" || body.cadence === "quarterly"
      ? Math.max(1, Math.min(28, body.dayOfMonth ?? 1))
      : null;
  const dayOfWeek =
    body.cadence === "weekly" || body.cadence === "biweekly"
      ? Math.max(0, Math.min(6, body.dayOfWeek ?? 1))
      : null;

  const nextRunAt = computeNextRunAt(
    {
      cadence: body.cadence,
      dayOfMonth,
      dayOfWeek,
      hour,
      minute,
    },
    new Date(),
  );

  const created = await prisma.reportSchedule.create({
    data: {
      title: body.title.trim(),
      plantId,
      clientId,
      cadence: body.cadence,
      dayOfMonth,
      dayOfWeek,
      hour,
      minute,
      recipientEmail: body.recipientEmail?.trim() || null,
      active: true,
      nextRunAt,
    },
  });

  return NextResponse.json({ id: created.id });
}
