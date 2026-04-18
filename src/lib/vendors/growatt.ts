/**
 * Growatt vendor adapter for auto-remediation.
 *
 * Growatt's public API exposes:
 *   POST /v1/inverterSet { device_sn, paramId, command_1, command_2 }
 * See https://growatt.pl/wp-content/uploads/2020/01/Growatt-Server-API-Guide.pdf §4.3.7
 *
 * The hackathon middleware proxies only GET on /growatt/* today, so this adapter
 * runs in dry_run by default. The payload shape is preserved for production use.
 */
import type {
  VendorAction,
  VendorAdapter,
  VendorRequestPlan,
  VendorRequestStep,
} from "./types";

const BASE = "/growatt";

type Phase = "pre_check" | "action" | "post_check" | "verify";

function inverterSet(
  deviceSn: string,
  paramId: string,
  command1: string,
  description: string,
  phase: Phase = "action",
): VendorRequestStep {
  return {
    kind: "http",
    method: "POST",
    path: `${BASE}/v1/inverterSet`,
    body: { device_sn: deviceSn, paramId, command_1: command1, command_2: "" },
    description,
    phase,
  };
}

function buildRestartInverter(deviceSn: string): VendorRequestStep[] {
  return [
    inverterSet(deviceSn, "pv_on_off", "0000", "Apagar inversor remotamente", "action"),
    { kind: "wait", durationMs: 60_000, description: "Esperar 60s antes de reencender" },
    inverterSet(deviceSn, "pv_on_off", "0001", "Encender inversor remotamente", "action"),
  ];
}

function buildSetPowerLimit(deviceSn: string, percent: number): VendorRequestStep[] {
  const clamped = Math.max(20, Math.min(100, Math.round(percent)));
  const hex = clamped.toString(16).padStart(4, "0");
  return [
    inverterSet(
      deviceSn,
      "pv_active_p_rate",
      hex,
      `Limitar potencia activa al ${clamped}%`,
      "action",
    ),
  ];
}

function buildSetWorkMode(deviceSn: string, workMode: string): VendorRequestStep[] {
  return [
    inverterSet(
      deviceSn,
      "pv_work_mode",
      workMode,
      `Cambiar modo de trabajo a ${workMode}`,
      "action",
    ),
  ];
}

function buildToggleMppt(deviceSn: string): VendorRequestStep[] {
  return [
    inverterSet(deviceSn, "pv_mppt_reset", "0001", "Resetear MPPT", "action"),
  ];
}

function buildClearFault(deviceSn: string): VendorRequestStep[] {
  return [
    inverterSet(deviceSn, "pv_fault_clear", "0001", "Limpiar código de falla", "action"),
  ];
}

export const growattAdapter: VendorAdapter = {
  slug: "growatt",
  displayName: "Growatt",
  writeSupported: false,
  buildPlan(action: VendorAction): VendorRequestPlan {
    let steps: VendorRequestStep[] = [];
    switch (action.type) {
      case "restart_inverter":
        steps = buildRestartInverter(action.deviceSn);
        break;
      case "set_power_limit":
        steps = buildSetPowerLimit(action.deviceSn, action.percent);
        break;
      case "set_work_mode":
        steps = buildSetWorkMode(action.deviceSn, action.workMode);
        break;
      case "toggle_mppt":
        steps = buildToggleMppt(action.deviceSn);
        break;
      case "clear_fault":
        steps = buildClearFault(action.deviceSn);
        break;
    }
    return {
      provider: "growatt",
      action,
      steps,
      writeSupported: false,
      notes:
        "El middleware del hackathon sólo proxea GET en /growatt/*; POST /inverterSet listo para producción.",
    };
  },
};
