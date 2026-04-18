/**
 * Normalizadores de alarmas desde los payloads nativos de cada proveedor.
 * Emiten `ProviderAlarm`, la forma canónica que consume el worker de alarmas.
 */
import type { ProviderSlug } from "./normalize";

export type AlarmSeverity = "critical" | "warning" | "info";

export type ProviderAlarm = {
  /** id nativo del proveedor — garantiza dedupe a nivel (device, source, key). */
  providerAlarmKey: string;
  severity: AlarmSeverity;
  /** tipo canónico corto (`inverter_fault`, `comm_loss`, `grid_fault`, …). */
  type: string;
  message: string;
  startedAt: Date;
  resolvedAt?: Date | null;
  /** payload crudo para auditoría — opcional. */
  raw?: unknown;
};

const toDate = (v: unknown): Date | null => {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") {
    // Heurística: < 10^12 → segundos, si no → ms.
    return new Date(v < 1_000_000_000_000 ? v * 1000 : v);
  }
  const d = new Date(String(v));
  return Number.isFinite(d.getTime()) ? d : null;
};

// ─── Deye ──────────────────────────────────────────────────────
// POST /deye/v1.0/station/alertList  → { code, stationAlertItems: [...] }
// POST /deye/v1.0/device/alertList   → { code, alertList: [...] }
//
// Schema oficial (hackathon-provider-hub-docs / deye / 02-station.md §7 y 03-device.md §4):
//   { alertId, alertCode, alertLevel, alertMsg, deviceSn?, startTimestamp,
//     endTimestamp, status }
//   - alertLevel: STRING — "CRITICAL" | "ERROR" | "WARN" | "WARNING" | "INFO" ...
//   - startTimestamp / endTimestamp: segundos epoch.
//   - status: "CLEARED" | "ACTIVE" | ... → si CLEARED la alarma está resuelta.

type DeyeAlarmItem = {
  alertId?: number | string;
  alertCode?: string;
  alertLevel?: string;
  alertMsg?: string;
  deviceSn?: string;
  startTimestamp?: number | string;
  endTimestamp?: number | string | null;
  status?: string;
};

function deyeSeverity(level: unknown): AlarmSeverity {
  const v = String(level ?? "").toUpperCase();
  if (v === "CRITICAL" || v === "FATAL" || v === "ERROR" || v === "FAULT") return "critical";
  if (v === "WARN" || v === "WARNING" || v === "MAJOR" || v === "MINOR") return "warning";
  if (v === "INFO" || v === "NOTICE") return "info";
  return "warning";
}

export function normalizeDeyeAlarms(resp: unknown): ProviderAlarm[] {
  const r = resp as {
    code?: string;
    stationAlertItems?: DeyeAlarmItem[];
    alertList?: DeyeAlarmItem[];
  } | null;
  if (!r) return [];
  const list = Array.isArray(r.stationAlertItems)
    ? r.stationAlertItems
    : Array.isArray(r.alertList)
      ? r.alertList
      : null;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => {
    const key = String(a.alertId ?? "");
    if (!key) return [];
    const started = toDate(a.startTimestamp);
    if (!started) return [];
    const end = toDate(a.endTimestamp);
    const isCleared = String(a.status ?? "").toUpperCase() === "CLEARED";
    return [{
      providerAlarmKey: key,
      severity: deyeSeverity(a.alertLevel),
      type: String(a.alertCode ?? "deye_alert").slice(0, 60),
      message: String(a.alertMsg ?? a.alertCode ?? "Alarma Deye"),
      startedAt: started,
      // Upstream dice resuelto si status=CLEARED, o si endTimestamp es > startTimestamp.
      resolvedAt: isCleared || (end && end.getTime() > started.getTime()) ? end : null,
      raw: a,
    } satisfies ProviderAlarm];
  });
}

// ─── Huawei ────────────────────────────────────────────────────
// POST /huawei/thirdData/getAlarmList
//   Respuesta: { success, data: [{ alarmId, alarmName, alarmCause, alarmType,
//   lev (1/2/3/4), raiseTime, recoveryTime, repairSuggestion, ... }] }
//   lev: 1=critical, 2=major(warning), 3=minor(warning), 4=warning(info).

type HuaweiAlarmItem = {
  alarmId?: number | string;
  alarmName?: string;
  alarmCause?: string;
  alarmType?: number | string;
  lev?: number | string;
  raiseTime?: number | string;
  recoveryTime?: number | string | null;
  repairSuggestion?: string;
};

function huaweiSeverity(lev: unknown): AlarmSeverity {
  const n = Number(lev);
  if (n === 1) return "critical";
  if (n === 2 || n === 3) return "warning";
  return "info";
}

export function normalizeHuaweiAlarms(resp: unknown): ProviderAlarm[] {
  const r = resp as { success?: boolean; data?: HuaweiAlarmItem[] } | null;
  if (!r || r.success === false || !Array.isArray(r.data)) return [];
  return r.data.flatMap((a) => {
    const key = String(a.alarmId ?? "");
    const started = toDate(a.raiseTime);
    if (!key || !started) return [];
    return [{
      providerAlarmKey: key,
      severity: huaweiSeverity(a.lev),
      type: `huawei_${a.alarmType ?? "alarm"}`.slice(0, 60),
      message: [a.alarmName, a.alarmCause].filter(Boolean).join(" — ") || "Alarma Huawei",
      startedAt: started,
      resolvedAt: toDate(a.recoveryTime) ?? null,
      raw: a,
    } satisfies ProviderAlarm];
  });
}

export function normalizeProviderAlarms(
  slug: ProviderSlug,
  resp: unknown,
): ProviderAlarm[] {
  switch (slug) {
    case "deye":
      return normalizeDeyeAlarms(resp);
    case "growatt":
      // Growatt no expone endpoint público de alarmas. Se derivan de lecturas.
      return [];
    case "huawei":
      return normalizeHuaweiAlarms(resp);
  }
}
