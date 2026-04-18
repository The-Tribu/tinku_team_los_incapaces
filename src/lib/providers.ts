/**
 * Per-provider endpoint registry.
 * Maps a device → middleware endpoint + method + body used for polling.
 */
import type { ProviderSlug } from "./normalize";

export type EndpointSpec = {
  method: "GET" | "POST";
  path: string;
  body?: unknown;
};

export function readingEndpoint(slug: ProviderSlug, externalId: string): EndpointSpec {
  switch (slug) {
    case "growatt":
      return {
        method: "GET",
        path: `/growatt/v1/plant/data?plant_id=${encodeURIComponent(externalId)}`,
      };
    case "deye":
      return {
        method: "POST",
        path: "/deye/v1.0/station/latest",
        body: { stationId: externalId },
      };
    case "huawei":
      return {
        method: "POST",
        path: "/huawei/thirdData/getStationRealKpi",
        body: { stationCodes: externalId },
      };
    default: {
      const _exhaustive: never = slug;
      throw new Error(`Unknown provider ${_exhaustive}`);
    }
  }
}

export function plantsListEndpoint(slug: ProviderSlug): EndpointSpec {
  switch (slug) {
    case "growatt":
      return { method: "GET", path: "/growatt/v1/plant/list" };
    case "deye":
      return { method: "POST", path: "/deye/v1.0/station/list", body: { page: 1, size: 50 } };
    case "huawei":
      return { method: "POST", path: "/huawei/thirdData/stations", body: { pageNo: 1 } };
  }
}

/**
 * Endpoint de alarmas por proveedor. Deye requiere ventana en segundos
 * (<=30 días), Huawei en ms (<=7 días). Growatt no tiene endpoint dedicado
 * de alarma a nivel planta — se usa `device/inverter/alarm` por device id.
 */
export function alarmsEndpoint(
  slug: ProviderSlug,
  externalId: string,
  windowMs: number,
): EndpointSpec | null {
  const now = Date.now();
  const start = now - windowMs;
  switch (slug) {
    case "deye":
      return {
        method: "POST",
        path: "/deye/v1.0/station/alertList",
        body: {
          stationId: externalId,
          startTimestamp: Math.floor(start / 1000),
          endTimestamp: Math.floor(now / 1000),
          page: 1,
          size: 50,
        },
      };
    case "huawei":
      return {
        method: "POST",
        path: "/huawei/thirdData/getAlarmList",
        body: {
          stationCodes: externalId,
          beginTime: start,
          endTime: now,
          language: "es_ES",
        },
      };
    case "growatt":
      // Growatt: alarmas son por inverter_id, no por plant. El worker las
      // busca cuando hay un device.externalId de tipo inverter disponible.
      return null;
    default: {
      const _exhaustive: never = slug;
      throw new Error(`Unknown provider ${_exhaustive}`);
    }
  }
}

export function growattInverterAlarmEndpoint(inverterSn: string): EndpointSpec {
  return {
    method: "GET",
    path: `/growatt/v1/device/inverter/alarm?inverter_id=${encodeURIComponent(inverterSn)}`,
  };
}
