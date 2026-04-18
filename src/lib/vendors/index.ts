/**
 * Vendor adapter registry.
 *
 * Maps a provider slug to the adapter that builds remediation request plans.
 * Unknown providers return `null` so the executor can gracefully skip them.
 */
import type { VendorAdapter } from "./types";
import { deyeAdapter } from "./deye";
import { growattAdapter } from "./growatt";
import { huaweiAdapter } from "./huawei";

export const vendorAdapters: Record<string, VendorAdapter> = {
  deye: deyeAdapter,
  growatt: growattAdapter,
  huawei: huaweiAdapter,
};

export function getVendorAdapter(slug: string): VendorAdapter | null {
  return vendorAdapters[slug] ?? null;
}

export * from "./types";
