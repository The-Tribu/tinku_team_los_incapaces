/**
 * SunHub · Catálogo de comandos de remediación.
 *
 * Cada comando declara:
 *   - id          clave estable que se guarda en Remediation.commandType
 *   - label       texto UI
 *   - description qué hace y qué riesgo tiene
 *   - risk        low | medium | high (driver del guardrail requireLlmForRisk)
 *   - appliesTo   triggers donde la heurística puede sugerirlo (alarm.type)
 *   - supportedProviders proveedores donde el endpoint REAL existe
 *   - endpointPath(deviceExternalId, providerSlug) genera el path correcto por proveedor
 *   - buildPayload genera el body que enviaríamos al middleware en modo real
 *
 * Importante: la guía oficial del hub-docs aclara que en Deye/Huawei/Growatt
 * los endpoints de escritura NO están habilitados para los equipos del hackathon.
 * El executor igual intenta el POST en modo real para dejar auditoría honesta
 * (probable 4xx); en modo mock ni siquiera se llama.
 */
export type CommandId =
  | "restart_inverter"
  | "clear_fault"
  | "set_work_mode_battery_first"
  | "set_work_mode_grid_first"
  | "custom_control";

export type CommandRisk = "low" | "medium" | "high";

export type ProviderEndpoint = { path: string; payload: Record<string, unknown> };

export type CommandDef = {
  id: CommandId;
  label: string;
  description: string;
  risk: CommandRisk;
  /** tipos de alarma (Alarm.type) donde este comando suele aplicar */
  appliesTo: string[];
  /** proveedores donde el endpoint write existe en la doc del middleware */
  supportedProviders: string[];
  /** Genera path + payload por proveedor. Devuelve null si el proveedor no aplica. */
  build: (
    deviceExternalId: string,
    providerSlug: string,
    args?: Record<string, unknown>,
  ) => ProviderEndpoint | null;
};

/** Endpoints conocidos por proveedor para los comandos disponibles. */
function deyeControl(deviceSn: string, orderType: string, params: Record<string, unknown>): ProviderEndpoint {
  return {
    path: "/deye/v1.0/order/deviceControl",
    payload: { deviceSn, orderType, params },
  };
}

function huaweiControl(devId: string, signal: string, value: unknown): ProviderEndpoint {
  // Huawei expone /thirdData/devControl. El contrato real requiere `devTypeId`
  // adicional, no disponible aquí — quedará 4xx si se invoca, pero el audit
  // refleja el intento honesto.
  return {
    path: "/huawei/thirdData/devControl",
    payload: { devIds: devId, controlType: signal, value },
  };
}

function growattControl(plantId: string, action: string, params: Record<string, unknown>): ProviderEndpoint {
  // Growatt OpenAPI no documenta un control unificado; usamos una ruta
  // probable para que quede en audit. En real responderá 4xx — útil para
  // demostrar el flujo sin engañar al usuario.
  return {
    path: "/growatt/v1/device/control",
    payload: { plant_id: plantId, action, params },
  };
}

export const COMMANDS: Record<CommandId, CommandDef> = {
  restart_inverter: {
    id: "restart_inverter",
    label: "Reiniciar inversor",
    description:
      "Envía un reset suave al inversor. Útil cuando el dispositivo aparece offline intermitente o quedó colgado tras un corte.",
    risk: "medium",
    appliesTo: ["offline", "provider", "low_gen"],
    supportedProviders: ["deye", "huawei", "growatt"],
    build: (sn, slug) => {
      switch (slug) {
        case "deye":
          return deyeControl(sn, "RESTART", { mode: "soft" });
        case "huawei":
          return huaweiControl(sn, "RESTART", 1);
        case "growatt":
          return growattControl(sn, "restart", {});
        default:
          return null;
      }
    },
  },
  clear_fault: {
    id: "clear_fault",
    label: "Borrar falla (clear fault)",
    description:
      "Limpia el estado de falla del inversor sin reiniciar. Se usa cuando la condición ya pasó pero el equipo no libera la alarma.",
    risk: "low",
    appliesTo: ["provider", "voltage", "frequency", "temperature"],
    supportedProviders: ["deye", "huawei"],
    build: (sn, slug) => {
      switch (slug) {
        case "deye":
          return deyeControl(sn, "CLEAR_FAULT", {});
        case "huawei":
          return huaweiControl(sn, "CLEAR_FAULT", 1);
        default:
          return null;
      }
    },
  },
  set_work_mode_battery_first: {
    id: "set_work_mode_battery_first",
    label: "Modo batería primero",
    description:
      "Cambia el modo de trabajo a BATTERY_FIRST. Para plantas híbridas cuando se detecta exportación ineficiente a red.",
    risk: "medium",
    appliesTo: ["low_gen"],
    supportedProviders: ["deye"],
    build: (sn, slug) => {
      if (slug !== "deye") return null;
      return {
        path: "/deye/v1.0/order/customControl",
        payload: {
          deviceSn: sn,
          orderType: "SET_WORK_MODE",
          params: { workMode: "BATTERY_FIRST" },
        },
      };
    },
  },
  set_work_mode_grid_first: {
    id: "set_work_mode_grid_first",
    label: "Modo red primero",
    description:
      "Cambia el modo de trabajo a GRID_FIRST. Para priorizar inyección a red cuando la batería está llena.",
    risk: "medium",
    appliesTo: [],
    supportedProviders: ["deye"],
    build: (sn, slug) => {
      if (slug !== "deye") return null;
      return {
        path: "/deye/v1.0/order/customControl",
        payload: {
          deviceSn: sn,
          orderType: "SET_WORK_MODE",
          params: { workMode: "GRID_FIRST" },
        },
      };
    },
  },
  custom_control: {
    id: "custom_control",
    label: "Comando personalizado",
    description:
      "Ejecuta un CUSTOM_CONTROL arbitrario. Requiere registro modbus y valor explícitos en `args`. Solo para ops avanzados.",
    risk: "high",
    appliesTo: [],
    supportedProviders: ["deye"],
    build: (sn, slug, args) => {
      if (slug !== "deye") return null;
      return {
        path: "/deye/v1.0/order/customControl",
        payload: {
          deviceSn: sn,
          orderType: "CUSTOM_CONTROL",
          params: args ?? {},
        },
      };
    },
  },
};

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];

export function getCommand(id: string): CommandDef | null {
  return (COMMANDS as Record<string, CommandDef | undefined>)[id] ?? null;
}

/**
 * Pre-filtro determinista: dado el tipo de alarma, devuelve los comandos
 * candidatos ordenados por confianza heurística.
 *
 * Esto es el "cheap path": si devuelve 1 candidato con confidence>=0.8 y la
 * política lo permite, el agente lo propone sin invocar LLM.
 */
export type CandidateSuggestion = {
  id: CommandId;
  confidence: number;
  rationale: string;
};

export function suggestCandidatesForAlarm(alarm: {
  type: string;
  severity?: string;
  message?: string;
}): CandidateSuggestion[] {
  const t = alarm.type.toLowerCase();
  const out: CandidateSuggestion[] = [];

  if (t.includes("offline") || t === "provider") {
    out.push({
      id: "restart_inverter",
      confidence: 0.85,
      rationale: "Dispositivo offline: reinicio suave es la primera línea de mitigación.",
    });
  }
  if (t.includes("voltage") || t.includes("frequency")) {
    out.push({
      id: "clear_fault",
      confidence: 0.8,
      rationale: "Anomalía eléctrica transitoria: limpiar falla suele liberar el alarm latch.",
    });
  }
  if (t.includes("temperature")) {
    out.push({
      id: "clear_fault",
      confidence: 0.6,
      rationale: "Temperatura alta: limpiar falla si la condición ya pasó. Si persiste, no actuar.",
    });
  }
  if (t.includes("low_gen")) {
    out.push({
      id: "restart_inverter",
      confidence: 0.55,
      rationale: "Generación baja persistente: a veces un reinicio recompone MPPT.",
    });
  }

  // Severity baja o info → bajamos toda la confianza, dejamos que el LLM decida.
  if (alarm.severity === "info") {
    return out.map((c) => ({ ...c, confidence: c.confidence * 0.5 }));
  }
  return out;
}

/**
 * Compat: un único commandId sugerido (para callers viejos que aún esperaban
 * la firma original). Devuelve el de mayor confianza.
 */
export function suggestCommandForAlarm(alarmType: string): CommandId | null {
  const list = suggestCandidatesForAlarm({ type: alarmType });
  if (list.length === 0) return null;
  return list[0].id;
}
