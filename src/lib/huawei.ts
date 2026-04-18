/**
 * Huawei FusionSolar — helpers multi-step.
 *
 * El endpoint `getStationRealKpi` **no** retorna potencia instantánea (solo
 * `day_power` acumulado). Para tener `active_power` real hay que hacer 2 calls:
 *
 *   1. POST /thirdData/getDevList   (cacheada 1h, devices cambian poco)
 *   2. POST /thirdData/getDevRealKpi con los `devId` de inversores (devTypeId=1)
 *
 * Ver docs del middleware en `hackathon-provider-hub-docs/huawei/`.
 *
 * Además expone helpers para series históricas (getKpiStationHour y
 * getDevHistoryKpi) y normaliza el failCode=407 del upstream como rate-limit.
 */
import { mwPost } from "./middleware";
import type { CanonicalReading, DeviceStatus } from "./normalize";

// ── Tipos envelope ─────────────────────────────────────────────

type HuaweiEnvelope<T> = {
  success?: boolean;
  failCode?: number;
  message?: string | null;
  data?: T;
};

type HuaweiDevice = {
  id: number;
  devName?: string;
  devTypeId: number;
  esnCode?: string;
  invType?: string | null;
  model?: string | null;
  stationCode?: string;
};

type HuaweiDevRealKpiItem = {
  devId: number;
  sn?: string;
  dataItemMap?: {
    run_state?: number | null; // 0=apagado, 1=encendido, 2=desconectado
    active_power?: number | null; // kW instantáneo
    efficiency?: number | null; // %
    elec_freq?: number | null; // Hz
    power_factor?: number | null;
    temperature?: number | null; // °C
    day_cap?: number | null; // kWh hoy
    total_cap?: number | null;
    a_u?: number | null;
    b_u?: number | null;
    c_u?: number | null;
    a_i?: number | null;
    b_i?: number | null;
    c_i?: number | null;
    mppt_power?: number | null;
  };
};

type HuaweiStationHourItem = {
  stationCode: string;
  collectTime: number; // ms epoch
  dataItemMap?: {
    radiation_intensity?: number | null;
    theory_power?: number | null;
    inverter_power?: number | null;
    PVYield?: number | null;
    inverterYield?: number | null;
    ongrid_power?: number | null;
    power_profit?: number | null;
  };
};

type HuaweiDevHistoryItem = {
  devId: number;
  sn?: string;
  collectTime: number;
  dataItemMap?: {
    active_power?: number | null;
    mppt_power?: number | null;
    efficiency?: number | null;
    temperature?: number | null;
    elec_freq?: number | null;
    a_u?: number | null;
    a_i?: number | null;
  };
};

// ── Config ────────────────────────────────────────────────────

const DEV_TYPE_INVERTER = 1;
const DEV_LIST_CACHE_SEC = 60 * 60; // 1h — dispositivos cambian raramente
const MAX_HISTORY_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 días

// ── 1. getDevList (listar dispositivos de la planta) ──────────

/**
 * Lista los inversores (devTypeId=1) asociados a un stationCode. Resultado
 * cacheado en memoria 1h para evitar disparar el rate-limit upstream.
 */
export async function listHuaweiInverters(stationCode: string): Promise<HuaweiDevice[]> {
  const resp = await mwPost<HuaweiEnvelope<HuaweiDevice[]>>(
    "/huawei/thirdData/getDevList",
    { stationCodes: stationCode },
    { cacheTtlSec: DEV_LIST_CACHE_SEC },
  );
  if (!resp || resp.success === false || !Array.isArray(resp.data)) return [];
  return resp.data.filter((d) => d.devTypeId === DEV_TYPE_INVERTER);
}

// ── 2. getDevRealKpi (potencia instantánea por dispositivo) ───

export async function fetchHuaweiDevRealKpi(
  devIds: number[],
): Promise<HuaweiDevRealKpiItem[]> {
  if (devIds.length === 0) return [];
  const resp = await mwPost<HuaweiEnvelope<HuaweiDevRealKpiItem[]>>(
    "/huawei/thirdData/getDevRealKpi",
    { devIds: devIds.join(","), devTypeId: DEV_TYPE_INVERTER },
  );
  if (!resp || resp.success === false || !Array.isArray(resp.data)) return [];
  return resp.data;
}

/**
 * Obtiene la lectura canónica de una planta Huawei haciendo el flujo
 * completo: getDevList → filtra inversores → getDevRealKpi → agrega.
 *
 * Retorna `null` si la planta no tiene inversores (dongle-only) o si todos
 * los inversores responden sin `dataItemMap`.
 */
export async function fetchHuaweiPlantReading(
  stationCode: string,
): Promise<CanonicalReading | null> {
  const inverters = await listHuaweiInverters(stationCode);
  if (inverters.length === 0) return null;

  const items = await fetchHuaweiDevRealKpi(inverters.map((d) => d.id));
  if (items.length === 0) return null;

  let powerKw = 0;
  let energyKwh = 0;
  let tempSum = 0;
  let tempN = 0;
  let freqSum = 0;
  let freqN = 0;
  let voltSum = 0;
  let voltN = 0;
  let currentSum = 0;
  let currentN = 0;
  let pfSum = 0;
  let pfN = 0;
  let runningCount = 0;
  let anyData = false;

  for (const item of items) {
    const m = item.dataItemMap;
    if (!m) continue;
    anyData = true;
    if (m.run_state === 1) runningCount++;
    if (typeof m.active_power === "number") powerKw += m.active_power;
    if (typeof m.day_cap === "number") energyKwh += m.day_cap;
    if (typeof m.temperature === "number") {
      tempSum += m.temperature;
      tempN++;
    }
    if (typeof m.elec_freq === "number") {
      freqSum += m.elec_freq;
      freqN++;
    }
    // Tensión/corriente: promedio de las 3 fases si están disponibles
    const phaseVoltages = [m.a_u, m.b_u, m.c_u].filter(
      (v): v is number => typeof v === "number",
    );
    if (phaseVoltages.length) {
      voltSum += phaseVoltages.reduce((a, b) => a + b, 0) / phaseVoltages.length;
      voltN++;
    }
    const phaseCurrents = [m.a_i, m.b_i, m.c_i].filter(
      (v): v is number => typeof v === "number",
    );
    if (phaseCurrents.length) {
      currentSum += phaseCurrents.reduce((a, b) => a + b, 0) / phaseCurrents.length;
      currentN++;
    }
    if (typeof m.power_factor === "number") {
      pfSum += m.power_factor;
      pfN++;
    }
  }

  if (!anyData) return null;

  let status: DeviceStatus;
  if (runningCount === 0) status = "offline";
  else if (runningCount < items.length) status = "degraded";
  else if (powerKw <= 0) status = "warning"; // corriendo pero sin potencia → anomalía
  else status = "online";

  return {
    device_external_id: stationCode,
    power_ac_kw: Math.round(powerKw * 1000) / 1000,
    energy_kwh: energyKwh > 0 ? Math.round(energyKwh * 1000) / 1000 : undefined,
    temperature_c: tempN ? Math.round((tempSum / tempN) * 10) / 10 : undefined,
    frequency_hz: freqN ? Math.round((freqSum / freqN) * 100) / 100 : undefined,
    voltage_v: voltN ? Math.round((voltSum / voltN) * 10) / 10 : undefined,
    current_a: currentN ? Math.round((currentSum / currentN) * 10) / 10 : undefined,
    power_factor: pfN ? Math.round((pfSum / pfN) * 1000) / 1000 : undefined,
    status,
    ts: new Date().toISOString(),
  };
}

// ── 3. getKpiStationHour (curva horaria del día en curso) ─────

export type HuaweiHourlyPoint = {
  ts: string; // ISO del inicio de la hora
  energyKwh: number;
  irradianceWm2?: number;
  theoryKwh?: number;
  exportedKwh?: number;
};

/**
 * Serie horaria del día en curso (hasta 24 puntos). Ideal para un chart
 * intradiario. `collectTime` puede ser cualquier ms del día — Huawei lo
 * normaliza al inicio del día.
 */
export async function fetchHuaweiStationHour(
  stationCode: string,
  collectTimeMs: number = Date.now(),
): Promise<HuaweiHourlyPoint[]> {
  const resp = await mwPost<HuaweiEnvelope<HuaweiStationHourItem[]>>(
    "/huawei/thirdData/getKpiStationHour",
    { stationCodes: stationCode, collectTime: collectTimeMs },
  );
  if (!resp || resp.success === false || !Array.isArray(resp.data)) return [];
  const points: HuaweiHourlyPoint[] = [];
  for (const p of resp.data) {
    const m = p.dataItemMap;
    const kwh = m?.PVYield ?? m?.inverterYield ?? m?.inverter_power ?? null;
    if (kwh == null) continue;
    points.push({
      ts: new Date(p.collectTime).toISOString(),
      energyKwh: Number(kwh),
      irradianceWm2: m?.radiation_intensity ?? undefined,
      theoryKwh: m?.theory_power ?? undefined,
      exportedKwh: m?.ongrid_power ?? undefined,
    });
  }
  return points.sort((a, b) => a.ts.localeCompare(b.ts));
}

// ── 4. getDevHistoryKpi (serie 5-min, ventana ≤ 3 días) ───────

export type HuaweiDevHistoryPoint = {
  ts: string;
  devId: number;
  activePowerKw: number;
  temperatureC?: number;
  efficiency?: number;
};

export async function fetchHuaweiDevHistory(
  devIds: number[],
  startMs: number,
  endMs: number,
): Promise<HuaweiDevHistoryPoint[]> {
  if (devIds.length === 0) return [];
  if (endMs - startMs > MAX_HISTORY_WINDOW_MS) {
    throw new Error(
      `getDevHistoryKpi: ventana máxima ${MAX_HISTORY_WINDOW_MS / 86_400_000} días (docs huawei/03-kpi.md §8)`,
    );
  }
  const resp = await mwPost<HuaweiEnvelope<HuaweiDevHistoryItem[]>>(
    "/huawei/thirdData/getDevHistoryKpi",
    {
      devIds: devIds.join(","),
      devTypeId: DEV_TYPE_INVERTER,
      startTime: startMs,
      endTime: endMs,
    },
  );
  if (!resp || resp.success === false || !Array.isArray(resp.data)) return [];
  const out: HuaweiDevHistoryPoint[] = [];
  for (const p of resp.data) {
    const m = p.dataItemMap;
    if (!m || typeof m.active_power !== "number") continue;
    out.push({
      ts: new Date(p.collectTime).toISOString(),
      devId: p.devId,
      activePowerKw: m.active_power,
      temperatureC: m.temperature ?? undefined,
      efficiency: m.efficiency ?? undefined,
    });
  }
  return out.sort((a, b) => a.ts.localeCompare(b.ts));
}
