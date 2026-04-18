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
import { alarmsEndpoint, growattInverterAlarmEndpoint } from "../lib/providers";
import { normalizeProviderAlarms, type ProviderAlarm } from "../lib/alarms-normalize";
import type { ProviderSlug } from "../lib/normalize";
import { publishAlarm, type AlarmEvent } from "../lib/alarm-bus";
import { fanoutAlarm } from "../lib/notifications";

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
    if (slug === "growatt") {
      // En Growatt las alarmas son por inverter serial. Si el externalId del
      // device ES un plant_id (workflow actual de sync), saltamos hasta que
      // el sync genere devices a nivel inverter. Cuando llegue, el mismo
      // device tendrá `kind="inverter"` y externalId=serial.
      if (device.kind !== "inverter") return [];
      const ep = growattInverterAlarmEndpoint(device.externalId);
      const raw = await mw(ep.path, { method: ep.method });
      return normalizeProviderAlarms("growatt", raw, { inverterSn: device.externalId });
    }
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
