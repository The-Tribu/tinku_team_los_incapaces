/**
 * Policy lookup + action mapping for auto-remediation.
 */
import { prisma } from "../prisma";
import type { VendorAction } from "../vendors/types";

export type AlarmLike = {
  id: string;
  type: string;
  severity: string;
  deviceId: string;
};

export async function findPolicy(alarmType: string, providerSlug: string) {
  const specific = await prisma.remediationPolicy.findFirst({
    where: { alarmType, providerSlug, enabled: true },
  });
  if (specific) return specific;
  return prisma.remediationPolicy.findFirst({
    where: { alarmType, providerSlug: null, enabled: true },
  });
}

const SEVERITY_RANK: Record<string, number> = {
  info: 0,
  warning: 1,
  critical: 2,
};

export function severityExceeds(actual: string, max: string): boolean {
  return (SEVERITY_RANK[actual] ?? 0) > (SEVERITY_RANK[max] ?? 0);
}

export function mapAlarmToAction(
  alarm: AlarmLike,
  actionType: string,
  deviceSn: string,
): VendorAction | null {
  switch (actionType) {
    case "restart_inverter":
      return { type: "restart_inverter", deviceSn };
    case "set_power_limit":
      return { type: "set_power_limit", deviceSn, percent: 80 };
    case "toggle_mppt":
      return { type: "toggle_mppt", deviceSn };
    case "clear_fault":
      return { type: "clear_fault", deviceSn };
    case "set_work_mode":
      return { type: "set_work_mode", deviceSn, workMode: "BATTERY_FIRST" };
    default:
      return null;
  }
}
