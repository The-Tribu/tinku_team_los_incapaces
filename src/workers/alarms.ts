#!/usr/bin/env tsx
/**
 * Worker de alarmas.
 *
 * Por cada device (plant-level) consulta el endpoint de alarmas del provider
 * correspondiente, normaliza, deduplica contra la DB y emite eventos vía
 * `alarm-bus` cuando la alarma es nueva o cambia de estado. Cada evento
 * nuevo dispara fan-out por email respetando preferencias y cooldown.
 *
 * Uso:
 *   npm run alarms           # one-shot
 *   (además se engancha al cron cada minuto)
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(file: string) {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, rawV] = m;
      if (process.env[k]) continue;
      process.env[k] = rawV.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  } catch {
    /* optional */
  }
}

loadDotEnv(".env.local");
loadDotEnv(".env");

import { prisma } from "../lib/prisma";
import { mw, MiddlewareError } from "../lib/middleware";
import { alarmsEndpoint } from "../lib/providers";
import { normalizeProviderAlarms, type ProviderAlarm } from "../lib/alarms-normalize";
import type { ProviderSlug } from "../lib/normalize";
import { publishAlarm, type AlarmEvent } from "../lib/alarm-bus";
import { fanoutAlarm } from "../lib/notifications";
import { predictForPlant } from "../lib/predictions";
import { suggestCommandForAlarm } from "../lib/commands";
import { propose } from "../lib/remediation";
import { getOrCreatePolicy, toPolicyView } from "../lib/policies";

const WINDOW_DAYS = Number(process.env.ALARMS_WINDOW_DAYS ?? 2);

type DeviceRow = {
  id: string;
  externalId: string;
  plantId: string;
  kind: string;
  plant: { id: string; name: string; code: string };
  provider: { slug: string };
};

async function fetchProviderAlarms(device: DeviceRow): Promise<ProviderAlarm[]> {
  const slug = device.provider.slug as ProviderSlug;
  const windowMs = WINDOW_DAYS * 24 * 60 * 60 * 1000;

  try {
    const ep = alarmsEndpoint(slug, device.externalId, windowMs);
    if (!ep) return [];
    const init: RequestInit = { method: ep.method };
    if (ep.body !== undefined) init.body = JSON.stringify(ep.body);
    const raw = await mw(ep.path, init);
    return normalizeProviderAlarms(slug, raw);
  } catch (err) {
    if (err instanceof MiddlewareError) {
      console.warn(
        `[alarms] ${slug}/${device.externalId} → ${err.status}: ${err.body.slice(0, 120)}`,
      );
    } else {
      console.warn(`[alarms] ${slug}/${device.externalId} → ${(err as Error).message}`);
    }
    return [];
  }
}

function toEvent(row: {
  id: string;
  deviceId: string;
  severity: string;
  type: string;
  source: string;
  message: string;
  startedAt: Date;
}, device: DeviceRow, kind: AlarmEvent["kind"]): AlarmEvent {
  return {
    id: row.id,
    deviceId: row.deviceId,
    plantId: device.plant.id,
    plantName: device.plant.name,
    plantCode: device.plant.code,
    provider: device.provider.slug,
    severity: row.severity as AlarmEvent["severity"],
    type: row.type,
    source: row.source,
    message: row.message,
    startedAt: row.startedAt.toISOString(),
    kind,
  };
}

async function upsertAlarm(device: DeviceRow, a: ProviderAlarm): Promise<AlarmEvent | null> {
  const existing = await prisma.alarm.findUnique({
    where: {
      alarms_device_source_key: {
        deviceId: device.id,
        source: device.provider.slug,
        providerAlarmKey: a.providerAlarmKey,
      },
    },
  });

  if (!existing) {
    const created = await prisma.alarm.create({
      data: {
        deviceId: device.id,
        source: device.provider.slug,
        providerAlarmKey: a.providerAlarmKey,
        severity: a.severity,
        type: a.type,
        message: a.message,
        startedAt: a.startedAt,
        resolvedAt: a.resolvedAt ?? null,
      },
    });
    // Si nace ya resuelto (histórico), no emitimos como "new".
    if (created.resolvedAt) return null;
    return toEvent(created, device, "new");
  }

  // Si upstream dice que la alarma se resolvió y nosotros aún la teníamos abierta → resolver.
  if (a.resolvedAt && !existing.resolvedAt) {
    const updated = await prisma.alarm.update({
      where: { id: existing.id },
      data: { resolvedAt: a.resolvedAt },
    });
    return toEvent(updated, device, "resolved");
  }
  return null;
}

/**
 * Loop de aprendizaje / auto-match: cuando nace una alarma, buscamos
 * predicciones abiertas (últimos 14d, sin outcome) del mismo device cuyo
 * `predictedType` corresponda al `type` de la alarma → marcamos outcome =
 * auto_matched. Esto alimenta la métrica de accuracy y la memoria del LLM.
 */
async function autoMatchOpenPredictions(deviceId: string, alarmId: string, alarmType: string) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const candidates = await prisma.prediction.findMany({
    where: {
      deviceId,
      generatedAt: { gte: since },
      outcome: null,
      sourceAlarmId: null, // si ya fue triggered por una alarma, no cerramos con ella misma
    },
    select: { id: true, predictedType: true },
  });
  const typeMatch = (pred: string, alarm: string) => {
    const a = alarm.toLowerCase();
    if (pred === "failure") return ["offline", "provider", "voltage", "frequency"].some((k) => a.includes(k));
    if (pred === "degradation") return ["temperature", "low_gen", "provider"].some((k) => a.includes(k));
    if (pred === "low_gen") return a.includes("low_gen") || a.includes("provider");
    return false;
  };
  for (const p of candidates) {
    if (!typeMatch(p.predictedType, alarmType)) continue;
    await prisma.predictionOutcome.create({
      data: {
        predictionId: p.id,
        status: "auto_matched",
        matchedAlarmId: alarmId,
        actualEventAt: new Date(),
      },
    });
  }
}

/** On-alarm: corre predicción triggered + propone remediación si política lo permite. */
async function handleAlarmTriggeredFlow(
  device: DeviceRow,
  alarm: { id: string; type: string; message: string; severity: string },
) {
  // 1. Auto-match de predicciones abiertas (accuracy loop)
  await autoMatchOpenPredictions(device.id, alarm.id, alarm.type).catch((err) =>
    console.warn(`[alarms] auto-match failed: ${(err as Error).message}`),
  );

  // 2. Disparar predicción enmarcada en esta alarma — sin bloquear el worker
  //    si MiniMax está lento. Corre en background.
  void (async () => {
    try {
      await predictForPlant(device.plant.id, {
        triggerKind: "alarm",
        sourceAlarmId: alarm.id,
        deviceId: device.id,
      });
    } catch (err) {
      console.warn(`[alarms] predict trigger failed: ${(err as Error).message}`);
    }
  })();

  // 3. Remediación sugerida si hay comando aplicable y política la permite
  const commandId = suggestCommandForAlarm(alarm.type);
  if (!commandId) return;
  try {
    const policyRow = await getOrCreatePolicy(device.plant.id);
    const policy = toPolicyView(policyRow);
    if (policy.autonomyLevel === "manual") {
      // manual: ni siquiera proponer (queda para que el operador decida sin ruido)
      return;
    }
    if (!policy.allowedCommands.includes(commandId)) return;
    await propose({
      plantId: device.plant.id,
      deviceId: device.id,
      deviceExternalId: device.externalId,
      commandId,
      reason: `Alarma ${alarm.severity}/${alarm.type}: ${alarm.message.slice(0, 140)}`,
      alarmId: alarm.id,
      proposedBy: "ai",
    });
  } catch (err) {
    console.warn(`[alarms] propose remediation failed: ${(err as Error).message}`);
  }
}

export async function ingestAlarms() {
  const started = Date.now();
  const devices = await prisma.device.findMany({
    include: {
      plant: { select: { id: true, name: true, code: true } },
      provider: { select: { slug: true } },
    },
  });
  if (devices.length === 0) {
    return { newAlarms: 0, resolved: 0, devices: 0 };
  }

  let newAlarms = 0;
  let resolved = 0;
  for (const d of devices) {
    const slug = d.provider.slug as ProviderSlug;
    if (slug !== "deye" && slug !== "growatt" && slug !== "huawei") continue;
    const alarms = await fetchProviderAlarms(d as DeviceRow);
    for (const a of alarms) {
      const event = await upsertAlarm(d as DeviceRow, a);
      if (!event) continue;
      publishAlarm(event);
      if (event.kind === "new") {
        newAlarms++;
        // fan-out async — no bloqueamos el worker por una conexión SMTP lenta
        void fanoutAlarm(event).catch((err) =>
          console.warn(`[alarms] fanout failed for ${event.id}: ${(err as Error).message}`),
        );
        // Trigger de predicción + remediación en background
        void handleAlarmTriggeredFlow(d as DeviceRow, {
          id: event.id,
          type: event.type,
          message: event.message,
          severity: event.severity,
        });
      } else if (event.kind === "resolved") {
        resolved++;
      }
    }
  }

  const dur = Date.now() - started;
  console.log(
    `[alarms] tick done · new=${newAlarms} resolved=${resolved} devices=${devices.length} · ${dur}ms`,
  );
  return { newAlarms, resolved, devices: devices.length };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ingestAlarms()
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
