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
// POST /deye/v1.0/station/alertList
//   Respuesta esperada (capturada en probes): { success, list: [{ id, message,
//   level, alertTime, repairTime, deviceSn, ... }] } o { data: { list: [...] } }.
//
//   `level` → 1/2/3 según doc Deye (1=critical, 2=warning, 3=info).

type DeyeAlarmItem = {
  id?: number | string;
  alertId?: number | string;
  deviceSn?: string;
  alertCode?: string;
  alertName?: string;
  alertDesc?: string;
  message?: string;
  level?: number | string;
  severity?: number | string;
  alertTime?: number | string;
  startTime?: number | string;
  repairTime?: number | string | null;
  endTime?: number | string | null;
  recoveryTime?: number | string | null;
};

function deyeSeverity(level: unknown): AlarmSeverity {
  const n = Number(level);
  if (n === 1) return "critical";
  if (n === 2) return "warning";
  if (n === 3) return "info";
  return "warning";
}

export function normalizeDeyeAlarms(resp: unknown): ProviderAlarm[] {
  const r = resp as { success?: boolean; list?: DeyeAlarmItem[]; data?: { list?: DeyeAlarmItem[] } } | null;
  if (!r) return [];
  const list = Array.isArray(r.list) ? r.list : r.data?.list;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => {
    const key = String(a.alertId ?? a.id ?? "");
    if (!key) return [];
    const started = toDate(a.alertTime ?? a.startTime);
    if (!started) return [];
    return [{
      providerAlarmKey: key,
      severity: deyeSeverity(a.level ?? a.severity),
      type: String(a.alertCode ?? a.alertName ?? "deye_alert").slice(0, 60),
      message: String(a.alertDesc ?? a.alertName ?? a.message ?? "Alarma Deye"),
      startedAt: started,
      resolvedAt: toDate(a.repairTime ?? a.endTime ?? a.recoveryTime) ?? null,
      raw: a,
    } satisfies ProviderAlarm];
  });
}

// ─── Growatt ───────────────────────────────────────────────────
// GET /growatt/v1/device/inverter/alarm?inverter_id=...
//   Envelope: { error_code, error_msg, data: { alarms: [{ alarm_code,
//   alarm_message, time, ... }] } }.

type GrowattAlarmItem = {
  alarm_code?: string | number;
  alarmCode?: string | number;
  alarm_message?: string;
  alarmMsg?: string;
  message?: string;
  time?: string | number;
  happen_time?: string | number;
  alarm_time?: string | number;
  end_time?: string | number;
  level?: string | number;
};

export function normalizeGrowattAlarms(resp: unknown, inverterSn: string): ProviderAlarm[] {
  const r = resp as { error_code?: number; data?: { alarms?: GrowattAlarmItem[] } | GrowattAlarmItem[] } | null;
  if (!r || (r.error_code ?? 0) !== 0) return [];
  const list = Array.isArray(r.data) ? r.data : r.data?.alarms;
  if (!Array.isArray(list)) return [];
  return list.flatMap((a) => {
    const code = String(a.alarm_code ?? a.alarmCode ?? "");
    const when = toDate(a.alarm_time ?? a.happen_time ?? a.time);
    if (!code || !when) return [];
    const msg = String(a.alarm_message ?? a.alarmMsg ?? a.message ?? `Alarma Growatt ${code}`);
    return [{
      providerAlarmKey: `${inverterSn}:${code}:${when.getTime()}`,
      severity: (String(a.level ?? "").toLowerCase() === "critical" ? "critical" : "warning") as AlarmSeverity,
      type: `growatt_${code}`.slice(0, 60),
      message: msg,
      startedAt: when,
      resolvedAt: toDate(a.end_time) ?? null,
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
  ctx: { inverterSn?: string } = {},
): ProviderAlarm[] {
  switch (slug) {
    case "deye":
      return normalizeDeyeAlarms(resp);
    case "growatt":
      return normalizeGrowattAlarms(resp, ctx.inverterSn ?? "");
    case "huawei":
      return normalizeHuaweiAlarms(resp);
  }
}
