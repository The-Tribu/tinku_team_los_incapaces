/**
 * Rules engine.
 * Consumes (Device, latest CanonicalReading) and synthesizes Alarm rows.
 * Each rule is idempotent: an open alarm of the same (device_id, type) is
 * reused rather than duplicated, so the engine can run every ingestion tick.
 */
import { prisma } from "./prisma";
import type { CanonicalReading } from "./normalize";
import { publishAlarm } from "./alarm-bus";
import { fanoutAlarm } from "./notifications";

export type EvalContext = {
  deviceId: string;
  plantCapacityKwp: number;
  currentStatus: string;
};

type Rule = {
  type: string; // offline | low_gen | voltage | frequency | temperature
  severity: "critical" | "warning" | "info";
  fires: (r: CanonicalReading, ctx: EvalContext) => boolean;
  message: (r: CanonicalReading, ctx: EvalContext) => string;
  suggestion?: (r: CanonicalReading, ctx: EvalContext) => string;
};

const RULES: Rule[] = [
  {
    type: "offline",
    severity: "critical",
    fires: (r) => r.status === "offline",
    message: () => "Dispositivo desconectado del middleware",
    suggestion: () =>
      "Verifica enlace del datalogger. Reinicia el equipo remotamente si el status se prolonga >15 min.",
  },
  {
    type: "low_gen",
    severity: "warning",
    fires: (r, ctx) => {
      const hour = new Date(r.ts).getUTCHours() - 5 + 24;
      const localHour = hour % 24;
      if (localHour < 8 || localHour > 16) return false; // solo horas productivas
      if (ctx.plantCapacityKwp === 0) return false;
      const ratio = r.power_ac_kw / ctx.plantCapacityKwp;
      return ratio < 0.15;
    },
    message: (r, ctx) =>
      `Generación baja: ${r.power_ac_kw.toFixed(1)}kW vs ${ctx.plantCapacityKwp}kWp esperados`,
    suggestion: () =>
      "Revisa sombras, ensuciamiento de paneles o fallo de MPPT. Cruza con alerta climática.",
  },
  {
    type: "voltage",
    severity: "warning",
    fires: (r) => {
      if (r.voltage_v === undefined) return false;
      const delta = Math.abs(r.voltage_v - 220) / 220;
      return delta > 0.1;
    },
    message: (r) => `Tensión fuera de rango: ${r.voltage_v?.toFixed(1)}V (objetivo 220±10%)`,
  },
  {
    type: "frequency",
    severity: "critical",
    fires: (r) => {
      if (r.frequency_hz === undefined) return false;
      const delta = Math.abs(r.frequency_hz - 60) / 60;
      return delta > 0.1;
    },
    message: (r) => `Frecuencia anómala: ${r.frequency_hz?.toFixed(2)}Hz (objetivo 60Hz)`,
  },
  {
    type: "temperature",
    severity: "warning",
    fires: (r) => r.temperature_c !== undefined && r.temperature_c > 65,
    message: (r) => `Temperatura del inversor ${r.temperature_c?.toFixed(1)}°C`,
    suggestion: () => "Verifica ventilación y obstrucciones. Limita derating si persiste.",
  },
];

export async function evaluateRules(
  reading: CanonicalReading,
  ctx: EvalContext,
): Promise<void> {
  for (const rule of RULES) {
    const fired = rule.fires(reading, ctx);
    const existing = await prisma.alarm.findFirst({
      where: { deviceId: ctx.deviceId, type: rule.type, resolvedAt: null, source: "rule" },
    });
    if (fired && !existing) {
      const created = await prisma.alarm.create({
        data: {
          deviceId: ctx.deviceId,
          type: rule.type,
          source: "rule",
          severity: rule.severity,
          message: rule.message(reading, ctx),
          aiSuggestion: rule.suggestion?.(reading, ctx),
        },
        include: {
          device: {
            include: {
              plant: { select: { id: true, name: true, code: true } },
              provider: { select: { slug: true } },
            },
          },
        },
      });
      const event = {
        id: created.id,
        deviceId: created.deviceId,
        plantId: created.device.plant.id,
        plantName: created.device.plant.name,
        plantCode: created.device.plant.code,
        provider: created.device.provider.slug,
        severity: created.severity as "critical" | "warning" | "info",
        type: created.type,
        source: created.source,
        message: created.message,
        startedAt: created.startedAt.toISOString(),
        kind: "new" as const,
      };
      publishAlarm(event);
      void fanoutAlarm(event).catch((err) =>
        console.warn(`[rules] fanout failed for ${event.id}: ${(err as Error).message}`),
      );
    } else if (!fired && existing) {
      // self-heal: condition cleared → resolve the alarm
      const updated = await prisma.alarm.update({
        where: { id: existing.id },
        data: { resolvedAt: new Date() },
        include: {
          device: {
            include: {
              plant: { select: { id: true, name: true, code: true } },
              provider: { select: { slug: true } },
            },
          },
        },
      });
      publishAlarm({
        id: updated.id,
        deviceId: updated.deviceId,
        plantId: updated.device.plant.id,
        plantName: updated.device.plant.name,
        plantCode: updated.device.plant.code,
        provider: updated.device.provider.slug,
        severity: updated.severity as "critical" | "warning" | "info",
        type: updated.type,
        source: updated.source,
        message: updated.message,
        startedAt: updated.startedAt.toISOString(),
        kind: "resolved",
      });
    }
  }
}
