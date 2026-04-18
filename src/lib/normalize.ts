/**
 * Canonical data model + per-provider normalizers.
 *
 * The canonical shape is what SunHub stores in `readings` and exposes to the UI.
 * Each provider adapter takes the raw middleware response and produces a
 * `CanonicalReading` (or null if the payload was unparseable / encrypted).
 *
 * See docs/ESPECIFICACIONES_TECNICAS.md §5.3.
 */

export type DeviceStatus = "online" | "warning" | "offline" | "degraded";

export type CanonicalReading = {
  device_external_id: string;
  power_ac_kw: number;
  voltage_v?: number;
  current_a?: number;
  frequency_hz?: number;
  power_factor?: number;
  temperature_c?: number;
  energy_kwh?: number;
  status: DeviceStatus;
  ts: string; // ISO
};

export type CanonicalPlant = {
  external_id: string;
  name: string;
  location?: string;
  lat?: number;
  lng?: number;
  capacity_kwp?: number;
};

// ─── Growatt ────────────────────────────────────────────────────
//
// `plant/data?plant_id=X` observed shape:
// { error_msg, error_code, data: { current_power, today_energy, total_energy,
//   monthly_energy, yearly_energy, peak_power_actual, last_update_time,
//   carbon_offset, timezone, efficiency } }

export type GrowattPlantData = {
  error_code: number;
  error_msg: string;
  data: {
    current_power?: number | string;
    today_energy?: number | string;
    monthly_energy?: number | string;
    yearly_energy?: number | string;
    total_energy?: number | string;
    peak_power_actual?: number | string;
    last_update_time?: string;
    carbon_offset?: number | string;
    timezone?: string;
    efficiency?: number | string;
  };
};

export type GrowattPlantListItem = {
  plant_id: number;
  name?: string;
  country?: string;
  city?: string;
  // Growatt devuelve lat/lng como strings en el payload real.
  latitude?: string | number | null;
  longitude?: string | number | null;
  peak_power?: number | string;
  total_energy?: string;
  // …other fields we don't need yet
};

const num = (v: unknown): number | undefined => {
  if (v === null || v === undefined || v === "") return undefined;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : undefined;
};

function inferStatus(powerKw: number | undefined, lastSeenIso: string | undefined): DeviceStatus {
  if (!lastSeenIso) return "offline";
  const ageMin = (Date.now() - new Date(lastSeenIso).getTime()) / 60_000;
  if (ageMin > 30) return "offline";
  if (ageMin > 10) return "warning";
  if (powerKw !== undefined && powerKw <= 0) return "degraded";
  return "online";
}

function parseGrowattTs(s: string | undefined): string {
  if (!s) return new Date().toISOString();
  // Growatt returns "YYYY-MM-DD HH:mm:ss" in plant timezone. Treat as local.
  const parsed = Date.parse(s.replace(" ", "T"));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString();
}

function normalizeGrowattPlantData(
  externalId: string,
  resp: GrowattPlantData,
): CanonicalReading | null {
  if (!resp || resp.error_code !== 0 || !resp.data) return null;
  const d = resp.data;
  const powerKw = num(d.current_power);
  const ts = parseGrowattTs(d.last_update_time);
  return {
    device_external_id: externalId,
    power_ac_kw: powerKw ?? 0,
    energy_kwh: num(d.today_energy),
    status: inferStatus(powerKw, ts),
    ts,
  };
}

function normalizeGrowattPlantList(resp: unknown): CanonicalPlant[] {
  // Accepts the clean shape from the first successful ping:
  // { error_msg, data: { plants: [...] } }
  if (!resp || typeof resp !== "object") return [];
  const r = resp as { data?: { plants?: GrowattPlantListItem[] }; plants?: GrowattPlantListItem[] };
  const list: GrowattPlantListItem[] = r.data?.plants ?? r.plants ?? [];
  if (!Array.isArray(list)) return [];
  return list.map((p) => ({
    external_id: String(p.plant_id),
    name: p.name ?? `Growatt Plant ${p.plant_id}`,
    location: [p.city, p.country].filter(Boolean).join(", ") || undefined,
    lat: num(p.latitude),
    lng: num(p.longitude),
    capacity_kwp: num(p.peak_power),
  }));
}

// ─── Deye ───────────────────────────────────────────────────────
// Observed responses:
//   POST /deye/v1.0/station/list   { stationList: [...], total, ... }
//   POST /deye/v1.0/station/latest { generationPower, lastUpdateTime, ... }
// `generationPower` arrives in Watts; we convert to kW in the canonical shape.

type DeyeStation = {
  id: number | string;
  name: string;
  locationLat?: number;
  locationLng?: number;
  locationAddress?: string;
  installedCapacity?: number; // kW
  connectionStatus?: string; // NORMAL | ALL_OFFLINE | PARTIAL_OFFLINE
  generationPower?: number; // W
  lastUpdateTime?: number; // unix seconds
};

type DeyeStationListResp = {
  success?: boolean;
  stationList?: DeyeStation[];
};

type DeyeStationLatestResp = {
  success?: boolean;
  generationPower?: number; // W
  consumptionPower?: number;
  batteryPower?: number;
  batterySOC?: number | null;
  irradiateIntensity?: number | null;
  lastUpdateTime?: number; // unix seconds
};

function deyeStatusFrom(connectionStatus: string | undefined, ageMin: number): DeviceStatus {
  if (connectionStatus === "ALL_OFFLINE" || ageMin > 30) return "offline";
  if (connectionStatus === "PARTIAL_OFFLINE" || ageMin > 10) return "warning";
  return "online";
}

function normalizeDeyeStationList(resp: unknown): CanonicalPlant[] {
  const r = resp as DeyeStationListResp | null;
  if (!r || !Array.isArray(r.stationList)) return [];
  return r.stationList.map((s) => ({
    external_id: String(s.id),
    name: s.name ?? `Deye Station ${s.id}`,
    location: s.locationAddress ?? undefined,
    lat: num(s.locationLat),
    lng: num(s.locationLng),
    capacity_kwp: num(s.installedCapacity),
  }));
}

function normalizeDeyeStationData(externalId: string, resp: unknown): CanonicalReading | null {
  const r = resp as DeyeStationLatestResp | null;
  if (!r || r.success === false) return null;
  const powerW = num(r.generationPower) ?? 0;
  const powerKw = powerW / 1000;
  const ts = r.lastUpdateTime ? new Date(r.lastUpdateTime * 1000).toISOString() : new Date().toISOString();
  const ageMin = (Date.now() - new Date(ts).getTime()) / 60_000;
  return {
    device_external_id: externalId,
    power_ac_kw: powerKw,
    status: deyeStatusFrom(undefined, ageMin),
    ts,
  };
}

// ─── Huawei FusionSolar ────────────────────────────────────────
//
// Endpoints usados:
//   POST /huawei/thirdData/stations          → lista paginada
//   POST /huawei/thirdData/getStationRealKpi → datos en tiempo real
//
// `dataItemMap` trae: day_power, month_power, total_power, day_income,
// total_income, day_on_grid_energy, day_use_energy, real_health_state
// (1=disconnected, 2=faulty, 3=healthy).

type HuaweiEnvelope<T> = {
  success?: boolean;
  failCode?: number;
  message?: string | null;
  data?: T;
};

type HuaweiStation = {
  stationCode: string;
  stationName?: string;
  stationAddr?: string;
  capacity?: number; // kWp
  latitude?: number;
  longitude?: number;
  buildState?: string;
  combineType?: string;
  aidType?: number;
};

type HuaweiStationRealKpi = {
  stationCode: string;
  dataItemMap?: {
    day_power?: number;
    month_power?: number;
    total_power?: number;
    day_income?: number;
    total_income?: number;
    day_on_grid_energy?: number;
    day_use_energy?: number;
    real_health_state?: number;
  };
};

function normalizeHuaweiStationList(resp: unknown): CanonicalPlant[] {
  const r = resp as HuaweiEnvelope<HuaweiStation[] | { list?: HuaweiStation[] }> | null;
  if (!r) return [];
  const list = Array.isArray(r.data) ? r.data : (r.data as { list?: HuaweiStation[] })?.list;
  if (!Array.isArray(list)) return [];
  return list.map((s) => ({
    external_id: s.stationCode,
    name: s.stationName ?? `Huawei ${s.stationCode}`,
    location: s.stationAddr ?? undefined,
    lat: num(s.latitude),
    lng: num(s.longitude),
    capacity_kwp: num(s.capacity),
  }));
}

function huaweiStatusFrom(healthState: number | undefined, ageMin: number): DeviceStatus {
  // 1 = disconnected, 2 = faulty, 3 = healthy
  if (healthState === 1 || ageMin > 30) return "offline";
  if (healthState === 2) return "warning";
  if (ageMin > 10) return "warning";
  return "online";
}

function normalizeHuaweiStationData(externalId: string, resp: unknown): CanonicalReading | null {
  const r = resp as HuaweiEnvelope<HuaweiStationRealKpi[]> | null;
  if (!r || r.success === false) return null;
  const item = Array.isArray(r.data) ? r.data.find((d) => d.stationCode === externalId) ?? r.data[0] : undefined;
  if (!item || !item.dataItemMap) return null;
  const d = item.dataItemMap;
  const ts = new Date().toISOString();
  // `day_power` viene en kWh acumulados del día. No tenemos potencia instantánea
  // directa; para generarla aproximamos con 0 si day_power=0 y dejamos que la
  // lectura alimente el contador energético. En siguientes iteraciones puede
  // consumirse /getDevRealKpi para potencia instantánea real.
  return {
    device_external_id: externalId,
    power_ac_kw: 0,
    energy_kwh: num(d.day_power),
    status: huaweiStatusFrom(d.real_health_state, 0),
    ts,
  };
}

// ─── Registry ───────────────────────────────────────────────────

export const providers = {
  growatt: {
    slug: "growatt" as const,
    displayName: "Growatt",
    plantsList: normalizeGrowattPlantList,
    plantReading: normalizeGrowattPlantData,
  },
  deye: {
    slug: "deye" as const,
    displayName: "DeyeCloud",
    plantsList: normalizeDeyeStationList,
    plantReading: normalizeDeyeStationData,
  },
  huawei: {
    slug: "huawei" as const,
    displayName: "Huawei FusionSolar",
    plantsList: normalizeHuaweiStationList,
    plantReading: normalizeHuaweiStationData,
  },
};

export type ProviderSlug = keyof typeof providers;
