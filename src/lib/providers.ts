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
  }
}
