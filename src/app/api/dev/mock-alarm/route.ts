import { NextResponse } from "next/server";
import { z } from "zod";
import { canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { publishAlarm, type AlarmEvent } from "@/lib/alarm-bus";
import { fanoutAlarm } from "@/lib/notifications";

const SCHEMA = z.object({
  plantCode: z.string().min(1).optional(),
  plantId: z.string().uuid().optional(),
  severity: z.enum(["critical", "warning", "info"]).default("critical"),
  type: z.enum(["offline", "provider", "voltage", "frequency", "low_gen", "temperature"]).default("offline"),
  message: z.string().max(300).optional(),
});

const DEFAULT_MESSAGES: Record<string, string> = {
  offline: "Inversor sin respuesta en los últimos 3 ciclos de polling.",
  provider: "Alarma reportada por el proveedor upstream.",
  voltage: "Voltaje fuera de rango (±10% del nominal 220V).",
  frequency: "Frecuencia fuera de ventana 59.5–60.5 Hz.",
  low_gen: "Generación por debajo del p05 histórico para esta hora.",
  temperature: "Temperatura del inversor por encima del p95 — riesgo térmico.",
};

export async function POST(req: Request) {
  const user = await getSessionUser();
  if (!user || !canWrite(user)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const body = SCHEMA.parse(await req.json().catch(() => ({})));
  const plant = body.plantId
    ? await prisma.plant.findUnique({ where: { id: body.plantId } })
    : body.plantCode
      ? await prisma.plant.findUnique({ where: { code: body.plantCode } })
      : await prisma.plant.findUnique({ where: { code: "TR-001" } });
  if (!plant) return NextResponse.json({ error: "plant_not_found" }, { status: 404 });

  const device = await prisma.device.findFirst({
    where: { plantId: plant.id },
    include: { provider: { select: { slug: true } } },
  });
  if (!device) return NextResponse.json({ error: "no_device_on_plant" }, { status: 404 });

  const providerAlarmKey = `mock-${Date.now().toString(36)}`;
  const message = body.message ?? DEFAULT_MESSAGES[body.type] ?? `Alarma de prueba (${body.type}).`;

  const alarm = await prisma.alarm.create({
    data: {
      deviceId: device.id,
      severity: body.severity,
      type: body.type,
      source: "mock",
      providerAlarmKey,
      message,
      startedAt: new Date(),
    },
  });

  const event: AlarmEvent = {
    id: alarm.id,
    deviceId: alarm.deviceId,
    plantId: plant.id,
    plantName: plant.name,
    plantCode: plant.code,
    provider: device.provider.slug,
    severity: body.severity,
    type: body.type,
    source: "mock",
    message,
    startedAt: alarm.startedAt.toISOString(),
    kind: "new",
  };
  publishAlarm(event);
  const fanout = await fanoutAlarm(event).catch((err) => ({
    email: { sent: 0, skipped: 0, failed: 1 },
    error: (err as Error).message,
  }));

  return NextResponse.json({
    ok: true,
    alarm: {
      id: alarm.id,
      severity: alarm.severity,
      type: alarm.type,
      message: alarm.message,
      startedAt: alarm.startedAt.toISOString(),
    },
    plant: { id: plant.id, code: plant.code, name: plant.name },
    fanout,
  });
}
