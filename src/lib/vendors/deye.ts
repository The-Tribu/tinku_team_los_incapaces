/**
 * Deye vendor adapter for auto-remediation.
 *
 * Honours the hackathon Provider Hub:
 *   - Read endpoints that DO exist:
 *       POST /deye/v1.0/config/system   (current workMode / limits)
 *       POST /deye/v1.0/config/battery  (battery params)
 *       GET  /deye/v1.0/order/{orderId} (status of a previously created order)
 *   - Write endpoints (`/v1.0/order/*Control`) are NOT enabled for teams, so
 *     the action step is built but the executor will honour `REMEDIATION_MODE`
 *     and fall back to dry_run in the demo. When Deye opens write later, the
 *     exact shape built here matches their public API contract.
 */
import type {
  VendorAction,
  VendorAdapter,
  VendorRequestPlan,
  VendorRequestStep,
} from "./types";

const BASE = "/deye";

function preCheckSystem(deviceSn: string): VendorRequestStep {
  return {
    kind: "http",
    method: "POST",
    path: `${BASE}/v1.0/config/system`,
    body: { deviceSn },
    description: "Pre-check: leer workMode y límites actuales",
    phase: "pre_check",
  };
}

function buildRestartInverter(deviceSn: string): VendorRequestStep[] {
  return [
    preCheckSystem(deviceSn),
    {
      kind: "http",
      method: "POST",
      path: `${BASE}/v1.0/order/inverterControl`,
      body: { deviceSn, action: "RESTART" },
      description: "Reiniciar inversor (apagar y encender)",
      phase: "action",
    },
    { kind: "wait", durationMs: 60_000, description: "Esperar 60s a que el inversor arranque" },
    {
      kind: "http",
      method: "POST",
      path: `${BASE}/v1.0/config/system`,
      body: { deviceSn },
      description: "Post-check: confirmar workMode tras reinicio",
      phase: "post_check",
    },
  ];
}

function buildSetPowerLimit(deviceSn: string, percent: number): VendorRequestStep[] {
  const clamped = Math.max(20, Math.min(100, Math.round(percent)));
  return [
    preCheckSystem(deviceSn),
    {
      kind: "http",
      method: "POST",
      path: `${BASE}/v1.0/order/powerLimitControl`,
      body: { deviceSn, limitPercent: clamped, limitControl: "LIMIT_POWER" },
      description: `Limitar potencia de salida al ${clamped}%`,
      phase: "action",
    },
  ];
}

function buildSetWorkMode(deviceSn: string, workMode: string): VendorRequestStep[] {
  return [
    preCheckSystem(deviceSn),
    {
      kind: "http",
      method: "POST",
      path: `${BASE}/v1.0/order/workModeControl`,
      body: { deviceSn, workMode },
      description: `Cambiar modo de trabajo a ${workMode}`,
      phase: "action",
    },
  ];
}

function buildToggleMppt(deviceSn: string): VendorRequestStep[] {
  return [
    preCheckSystem(deviceSn),
    {
      kind: "http",
      method: "POST",
      path: `${BASE}/v1.0/order/mpptControl`,
      body: { deviceSn, action: "RESET" },
      description: "Resetear seguimiento MPPT",
      phase: "action",
    },
  ];
}

function buildClearFault(deviceSn: string): VendorRequestStep[] {
  return [
    {
      kind: "http",
      method: "POST",
      path: `${BASE}/v1.0/order/faultClear`,
      body: { deviceSn },
      description: "Limpiar código de falla activo",
      phase: "action",
    },
  ];
}

export const deyeAdapter: VendorAdapter = {
  slug: "deye",
  displayName: "DeyeCloud",
  writeSupported: false, // middleware hackathon no expone /order/*Control
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
      provider: "deye",
      action,
      steps,
      writeSupported: false,
      notes:
        "Los endpoints /v1.0/order/*Control no están habilitados en el middleware del hackathon (doc oficial). En producción se despachan directamente.",
    };
  },
  parseOrderId(response: unknown): string | undefined {
    if (!response || typeof response !== "object") return undefined;
    const r = response as { orderId?: string | number };
    return r.orderId !== undefined ? String(r.orderId) : undefined;
  },
};
