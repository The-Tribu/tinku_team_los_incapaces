/**
 * Vendor adapter contract for auto-remediation.
 *
 * Each provider (Deye, Growatt, Huawei) translates a canonical `VendorAction`
 * into one or more HTTP requests. Adapters never execute the request — they
 * only build the payload. The executor decides whether to dispatch (live) or
 * log it (dry_run / shadow).
 */

export type VendorActionType =
  | "restart_inverter"
  | "set_power_limit"
  | "toggle_mppt"
  | "clear_fault"
  | "set_work_mode";

export type VendorAction =
  | { type: "restart_inverter"; deviceSn: string }
  | { type: "set_power_limit"; deviceSn: string; percent: number }
  | { type: "toggle_mppt"; deviceSn: string }
  | { type: "clear_fault"; deviceSn: string }
  | { type: "set_work_mode"; deviceSn: string; workMode: string };

export type VendorRequestStep =
  | {
      kind: "http";
      method: "GET" | "POST";
      path: string;
      body?: unknown;
      description: string;
      phase: "pre_check" | "action" | "post_check" | "verify";
    }
  | {
      kind: "wait";
      durationMs: number;
      description: string;
    };

export type VendorRequestPlan = {
  provider: string;
  action: VendorAction;
  steps: VendorRequestStep[];
  writeSupported: boolean;
  notes?: string;
};

export type VendorStepResult = {
  step: VendorRequestStep;
  ok: boolean;
  response?: unknown;
  error?: string;
  orderId?: string;
};

export interface VendorAdapter {
  readonly slug: string;
  readonly displayName: string;
  readonly writeSupported: boolean;
  buildPlan(action: VendorAction): VendorRequestPlan;
  parseOrderId?(response: unknown): string | undefined;
}
