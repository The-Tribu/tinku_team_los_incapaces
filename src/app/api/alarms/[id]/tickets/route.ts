import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { canWrite, getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

const VALID_PRIORITIES = ["low", "medium", "high", "urgent"] as const;
type Priority = (typeof VALID_PRIORITIES)[number];

function isPriority(p: unknown): p is Priority {
  return typeof p === "string" && (VALID_PRIORITIES as readonly string[]).includes(p);
}

// GET /api/alarms/[id]/tickets — lista tickets asociados a la alarma.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const tickets = await prisma.ticket.findMany({
    where: { alarmId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json({ tickets });
}

// POST /api/alarms/[id]/tickets — crea un ticket a partir de la alarma.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  if (!canWrite(user)) return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await params;
  const alarm = await prisma.alarm.findUnique({
    where: { id },
    include: {
      device: { include: { plant: { select: { name: true, code: true } } } },
      _count: { select: { tickets: true } },
    },
  });
  if (!alarm) return NextResponse.json({ error: "alarm_not_found" }, { status: 404 });
  if (alarm._count.tickets > 0) {
    return NextResponse.json(
      { error: "ticket_already_exists" },
      { status: 409 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    description?: string;
    priority?: string;
    assignee?: string | null;
  };

  const title = body.title?.trim();
  if (!title) {
    return NextResponse.json({ error: "title_required" }, { status: 400 });
  }
  const priority: Priority = isPriority(body.priority) ? body.priority : "medium";

  const ticket = await prisma.ticket.create({
    data: {
      alarmId: id,
      title,
      description: body.description?.trim() || null,
      priority,
      assignee: body.assignee?.trim() || null,
      createdBy: user.id,
      status: "open",
    },
  });

  // Al crear ticket, auto-ack la alarma si no estaba ack, para que "salga" del
  // tab "Nuevas" y pase al de "Asignadas".
  if (!alarm.acknowledgedAt) {
    await prisma.alarm.update({
      where: { id },
      data: {
        acknowledgedAt: new Date(),
        acknowledgedBy: user.id,
        assignee: alarm.assignee ?? user.name,
        assignedUserId: alarm.assignedUserId ?? user.id,
      },
    });
  }

  return NextResponse.json({ ticket }, { status: 201 });
}
