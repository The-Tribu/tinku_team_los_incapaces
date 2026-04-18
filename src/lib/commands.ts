/**
 * SunHub · Catálogo de comandos de remediación.
 *
 * Cada comando declara:
 *   - id          clave estable que se guarda en Remediation.commandType
 *   - label       texto UI
 *   - description qué hace y qué riesgo tiene
 *   - appliesTo   triggers donde la heurística puede sugerirlo (type de alarma, etc)
 *   - buildPayload genera el body que enviaríamos al middleware en modo real
 *   - endpoint    path del middleware que se golpearía en real mode
 *
 * Importante: la guía oficial del hub-docs aclara que en Deye los endpoints
 * de escritura (order/XControl, order/X/update) NO están habilitados para
 * los equipos del hackathon. El executor igual intenta el POST en modo real
 * para dejar auditoría honesta (probable 4xx del middleware); en modo mock
 * ni siquiera se llama.
 */
export type CommandId =
  | "restart_inverter"
  | "clear_fault"
  | "set_work_mode_battery_first"
  | "set_work_mode_grid_first"
  | "custom_control";

export type CommandDef = {
  id: CommandId;
  label: string;
  description: string;
  risk: "low" | "medium" | "high";
  // tipos de alarma (Alarm.type) donde este comando suele aplicar
  appliesTo: string[];
  endpointPath: (deviceExternalId: string) => string;
  buildPayload: (deviceExternalId: string, args?: Record<string, unknown>) => Record<string, unknown>;
};

export const COMMANDS: Record<CommandId, CommandDef> = {
  restart_inverter: {
    id: "restart_inverter",
    label: "Reiniciar inversor",
    description:
      "Envía un reset suave al inversor. Útil cuando el dispositivo aparece offline intermitente o quedó colgado tras un corte.",
    risk: "medium",
    appliesTo: ["offline", "provider", "low_gen"],
    endpointPath: () => "/deye/v1.0/order/deviceControl",
    buildPayload: (sn) => ({
      deviceSn: sn,
      orderType: "RESTART",
      params: { mode: "soft" },
    }),
  },
  clear_fault: {
    id: "clear_fault",
    label: "Borrar falla (clear fault)",
    description:
      "Limpia el estado de falla del inversor sin reiniciar. Se usa cuando la condición ya pasó pero el equipo no libera la alarma.",
    risk: "low",
    appliesTo: ["provider", "voltage", "frequency", "temperature"],
    endpointPath: () => "/deye/v1.0/order/deviceControl",
    buildPayload: (sn) => ({
      deviceSn: sn,
      orderType: "CLEAR_FAULT",
      params: {},
    }),
  },
  set_work_mode_battery_first: {
    id: "set_work_mode_battery_first",
    label: "Modo batería primero",
    description:
      "Cambia el modo de trabajo a BATTERY_FIRST. Para plantas híbridas cuando se detecta exportación ineficiente a red.",
    risk: "medium",
    appliesTo: ["low_gen"],
    endpointPath: () => "/deye/v1.0/order/customControl",
    buildPayload: (sn) => ({
      deviceSn: sn,
      orderType: "SET_WORK_MODE",
      params: { workMode: "BATTERY_FIRST" },
    }),
  },
  set_work_mode_grid_first: {
    id: "set_work_mode_grid_first",
    label: "Modo red primero",
    description:
      "Cambia el modo de trabajo a GRID_FIRST. Para priorizar inyección a red cuando la batería está llena.",
    risk: "medium",
    appliesTo: [],
    endpointPath: () => "/deye/v1.0/order/customControl",
    buildPayload: (sn) => ({
      deviceSn: sn,
      orderType: "SET_WORK_MODE",
      params: { workMode: "GRID_FIRST" },
    }),
  },
  custom_control: {
    id: "custom_control",
    label: "Comando personalizado",
    description:
      "Ejecuta un CUSTOM_CONTROL arbitrario. Requiere registro modbus y valor explícitos en `args`. Solo para ops avanzados.",
    risk: "high",
    appliesTo: [],
    endpointPath: () => "/deye/v1.0/order/customControl",
    buildPayload: (sn, args) => ({
      deviceSn: sn,
      orderType: "CUSTOM_CONTROL",
      params: args ?? {},
    }),
  },
};

export const COMMAND_IDS = Object.keys(COMMANDS) as CommandId[];

/** Elige un comando sugerido para una alarma o predicción dada. */
export function suggestCommandForAlarm(alarmType: string): CommandId | null {
  const normalized = alarmType.toLowerCase();
  // Orden importa: buscamos el más específico primero.
  if (normalized.includes("offline") || normalized === "provider") return "restart_inverter";
  if (normalized.includes("voltage") || normalized.includes("frequency")) return "clear_fault";
  if (normalized.includes("temperature")) return "clear_fault";
  if (normalized.includes("low_gen")) return "restart_inverter";
  return null;
}

export function getCommand(id: string): CommandDef | null {
  return (COMMANDS as Record<string, CommandDef | undefined>)[id] ?? null;
}
