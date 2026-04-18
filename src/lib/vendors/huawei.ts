/**
 * Huawei FusionSolar vendor adapter (stub).
 *
 * The hackathon Provider Hub lists `/huawei/*` as allowed for POST where the
 * vendor requires it, but no control endpoints are exposed. FusionSolar's
 * native API uses `POST /thirdData/setDevice` with `devDn` + `devTypeId` +
 * control signals; we reflect that shape so production migration is trivial.
 *
 * See Huawei Northbound Interface (NBI) doc:
 * https://support.huawei.com/enterprise/en/doc/EDOC1100520173/baf43abb/basic
 */
import type {
  VendorAction,
  VendorAdapter,
  VendorRequestPlan,
  VendorRequestStep,
} from "./types";

const BASE = "/huawei";

function controlStep(
  devDn: string,
  signalId: number,
  value: unknown,
  description: string,
): VendorRequestStep {
  return {
    kind: "http",
    method: "POST",
    path: `${BASE}/thirdData/setDevice`,
    body: { devDn, devTypeId: 1, signals: [{ signalId, value }] },
    description,
    phase: "action",
  };
}

export const huaweiAdapter: VendorAdapter = {
  slug: "huawei",
  displayName: "Huawei FusionSolar",
  writeSupported: false,
  buildPlan(action: VendorAction): VendorRequestPlan {
    let steps: VendorRequestStep[] = [];
    const sn = action.deviceSn;
    switch (action.type) {
      case "restart_inverter":
        steps = [
          controlStep(sn, 10001, 0, "Apagar inversor (signalId 10001 = power switch)"),
          { kind: "wait", durationMs: 60_000, description: "Esperar 60s" },
          controlStep(sn, 10001, 1, "Encender inversor"),
        ];
        break;
      case "set_power_limit":
        steps = [
          controlStep(
            sn,
            10003,
            Math.max(20, Math.min(100, Math.round(action.percent))),
            `Limitar potencia activa al ${action.percent}%`,
          ),
        ];
        break;
      case "toggle_mppt":
        steps = [controlStep(sn, 10010, 1, "Reset MPPT")];
        break;
      case "set_work_mode":
        steps = [controlStep(sn, 10020, action.workMode, `Set work mode ${action.workMode}`)];
        break;
      case "clear_fault":
        steps = [controlStep(sn, 10099, 1, "Clear active fault")];
        break;
    }
    return {
      provider: "huawei",
      action,
      steps,
      writeSupported: false,
      notes:
        "Huawei FusionSolar no está integrado en el middleware del hackathon; payload listo para NBI /thirdData/setDevice.",
    };
  },
};
