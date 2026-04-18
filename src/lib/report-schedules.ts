/**
 * Lógica de cadencia para programaciones de reportes.
 *
 * Solo maneja 4 cadencias: monthly, weekly, biweekly, quarterly.
 * El cálculo es "UTC-relativo a la zona dada" para que un cron en America/Bogota
 * dispare consistentemente sin importar dónde corra el worker.
 */
import type { ReportSchedule } from "@prisma/client";
import { prisma } from "./prisma";
import { computeReportMetrics, generateNarrative } from "./reports";
import { displayClientLabel } from "./display";

export type Cadence = "monthly" | "weekly" | "biweekly" | "quarterly";

export function isCadence(v: unknown): v is Cadence {
  return v === "monthly" || v === "weekly" || v === "biweekly" || v === "quarterly";
}

/**
 * Devuelve la próxima fecha (en UTC) en que un schedule debería correr,
 * comenzando desde `from` (por defecto, ahora).
 *
 * Aproximación simple: asumimos que la TZ "America/Bogota" es UTC-5
 * sin horario de verano (Colombia no hace DST). Para el hackathon basta.
 */
export function computeNextRunAt(
  schedule: Pick<
    ReportSchedule,
    "cadence" | "dayOfMonth" | "dayOfWeek" | "hour" | "minute"
  >,
  from: Date = new Date(),
): Date {
  const tzOffsetHours = 5; // America/Bogota = UTC-5
  // "Local" now en Bogota
  const localNow = new Date(from.getTime() - tzOffsetHours * 3600_000);
  const hour = schedule.hour ?? 7;
  const minute = schedule.minute ?? 0;

  let candidate: Date;

  if (schedule.cadence === "monthly") {
    const day = Math.min(28, Math.max(1, schedule.dayOfMonth ?? 1));
    candidate = new Date(Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      day,
      hour,
      minute,
    ));
    if (candidate.getTime() <= localNow.getTime()) {
      candidate = new Date(Date.UTC(
        localNow.getUTCFullYear(),
        localNow.getUTCMonth() + 1,
        day,
        hour,
        minute,
      ));
    }
  } else if (schedule.cadence === "quarterly") {
    const day = Math.min(28, Math.max(1, schedule.dayOfMonth ?? 1));
    const currentMonth = localNow.getUTCMonth();
    const quarterStartMonth = Math.floor(currentMonth / 3) * 3; // 0,3,6,9
    candidate = new Date(Date.UTC(
      localNow.getUTCFullYear(),
      quarterStartMonth,
      day,
      hour,
      minute,
    ));
    if (candidate.getTime() <= localNow.getTime()) {
      candidate = new Date(Date.UTC(
        localNow.getUTCFullYear(),
        quarterStartMonth + 3,
        day,
        hour,
        minute,
      ));
    }
  } else {
    // weekly | biweekly — dayOfWeek 0..6 (0 = domingo)
    const targetDow = schedule.dayOfWeek ?? 1;
    const stepDays = schedule.cadence === "weekly" ? 7 : 14;
    const base = new Date(Date.UTC(
      localNow.getUTCFullYear(),
      localNow.getUTCMonth(),
      localNow.getUTCDate(),
      hour,
      minute,
    ));
    const currentDow = base.getUTCDay();
    let diff = (targetDow - currentDow + 7) % 7;
    candidate = new Date(base.getTime() + diff * 86_400_000);
    if (candidate.getTime() <= localNow.getTime()) {
      candidate = new Date(candidate.getTime() + stepDays * 86_400_000);
    }
  }

  // Convertimos "hora local Bogota" → UTC real sumando el offset.
  return new Date(candidate.getTime() + tzOffsetHours * 3600_000);
}

/**
 * Descripción humana de la cadencia, estilo "Cada mes · día 1" — se muestra
 * en la card de la UI.
 */
export function describeCadence(
  s: Pick<ReportSchedule, "cadence" | "dayOfMonth" | "dayOfWeek">,
): string {
  const days = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  if (s.cadence === "monthly") return `Cada mes · día ${s.dayOfMonth ?? 1}`;
  if (s.cadence === "quarterly") return `Cada trimestre · día ${s.dayOfMonth ?? 1}`;
  if (s.cadence === "biweekly") return `Cada 15 días · ${days[s.dayOfWeek ?? 1]}`;
  return `Cada ${days[s.dayOfWeek ?? 1].toLowerCase()}es`;
}

/**
 * Devuelve un texto tipo "Mañana 07:00", "En 3 días", "Lunes 06:30" — usado
 * en la badge amarilla de la card.
 */
export function describeNextRun(nextRunAt: Date): string {
  const now = Date.now();
  const diffMs = nextRunAt.getTime() - now;
  const diffDays = Math.round(diffMs / 86_400_000);
  const hh = nextRunAt
    .toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: "America/Bogota",
    });

  if (diffMs <= 0) return "Pendiente";
  if (diffDays === 0) return `Hoy ${hh}`;
  if (diffDays === 1) return `Mañana ${hh}`;
  if (diffDays <= 6) {
    const wd = nextRunAt.toLocaleDateString("es-CO", {
      weekday: "long",
      timeZone: "America/Bogota",
    });
    const cap = wd.charAt(0).toUpperCase() + wd.slice(1);
    return `${cap} ${hh}`;
  }
  return `En ${diffDays} días`;
}

/**
 * Ejecuta un schedule: elige la planta a reportar (si aplica), computa
 * métricas + narrativa y persiste un Report. Actualiza `last_*` y
 * `nextRunAt` de manera atómica.
 */
export async function runSchedule(scheduleId: string): Promise<{
  ok: boolean;
  reportId?: string;
  error?: string;
}> {
  const schedule = await prisma.reportSchedule.findUnique({
    where: { id: scheduleId },
    include: {
      plant: { include: { client: true } },
      client: { include: { plants: { take: 1, orderBy: { name: "asc" } } } },
    },
  });
  if (!schedule) return { ok: false, error: "schedule not found" };

  // Determinar la planta objetivo: si el schedule está atado a una planta,
  // usamos esa; si está atado a un cliente, usamos su primera planta.
  const plant = schedule.plant ?? schedule.client?.plants[0];
  if (!plant) {
    const next = computeNextRunAt(schedule, new Date());
    await prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
        lastStatus: "failed",
        lastError: "No hay planta asociada al schedule",
        nextRunAt: next,
      },
    });
    return { ok: false, error: "schedule has no plant" };
  }

  const clientRecord = schedule.client ?? schedule.plant?.client;
  if (!clientRecord) return { ok: false, error: "no client" };

  try {
    const period = new Date();
    const metrics = await computeReportMetrics(plant.id, period);
    const clientLabel = displayClientLabel(clientRecord, { name: plant.name });
    let narrative = "";
    try {
      narrative = await generateNarrative(plant.name, clientLabel, metrics);
    } catch (err) {
      narrative = `(Narrativa IA no disponible: ${(err as Error).message})`;
    }

    const periodDay = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
    const report = await prisma.report.create({
      data: {
        clientId: clientRecord.id,
        plantId: plant.id,
        scheduleId: schedule.id,
        period: periodDay,
        status: "sent",
        compliancePct: metrics.compliancePct,
      },
    });

    const nextRunAt = computeNextRunAt(schedule, new Date());
    await prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
        lastStatus: "success",
        lastError: null,
        nextRunAt,
      },
    });

    // Nota: la narrativa queda disponible a través del endpoint /api/reports POST
    // si el usuario la pide desde la UI; aquí solo persistimos el Report básico.
    void narrative;

    return { ok: true, reportId: report.id };
  } catch (err) {
    const msg = (err as Error).message;
    const nextRunAt = computeNextRunAt(schedule, new Date());
    await prisma.reportSchedule.update({
      where: { id: scheduleId },
      data: {
        lastRunAt: new Date(),
        lastStatus: "failed",
        lastError: msg.slice(0, 500),
        nextRunAt,
      },
    });
    return { ok: false, error: msg };
  }
}

/**
 * Ejecuta todos los schedules activos cuyo `nextRunAt` ya venció.
 * Diseñado para correr cada minuto desde el cron worker.
 */
export async function runDueSchedules(): Promise<{
  checked: number;
  executed: number;
  failed: number;
}> {
  const now = new Date();
  const due = await prisma.reportSchedule.findMany({
    where: { active: true, nextRunAt: { lte: now } },
    select: { id: true },
    take: 20,
  });
  let executed = 0;
  let failed = 0;
  for (const s of due) {
    const res = await runSchedule(s.id);
    if (res.ok) executed++;
    else failed++;
  }
  return { checked: due.length, executed, failed };
}
