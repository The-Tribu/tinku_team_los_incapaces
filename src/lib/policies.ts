/**
 * SunHub · Política de automatización por planta.
 *
 * La política controla el ciclo de vida de una remediación:
 *   - autonomyLevel: "manual" → solo sugerir. "approval" → requiere aprobación humana.
 *     "auto" → el executor corre solo si executionMode lo permite.
 *   - executionMode: "mock" (simulación, no golpea el middleware) o "real"
 *     (POST al endpoint de write, con la aclaración de que los endpoints de
 *     escritura no están habilitados actualmente por el proveedor).
 *   - allowedCommands: subset de COMMAND_IDS que la planta autoriza.
 *   - requiredApproverRole: rol mínimo para aprobar (admin/ops).
 *   - maxActionsPerDay: circuit-breaker blando (cuenta executedAt del día).
 *
 * Guardrails extra (self-repair agentic):
 *   - quietHoursStart/quietHoursEnd: ventana horaria local de la planta donde
 *     NO se permite auto-execute (típico 22..5 para no despertar al cliente).
 *   - cooldownMinutes: anti-flap, evita reintentar el mismo commandType en la
 *     misma planta dentro del cooldown.
 *   - enabledProviders: whitelist de providerSlugs donde el agente puede actuar.
 *     Vacío = sin filtro.
 *   - requireLlmForRisk: comandos del catálogo cuyo `risk` esté en esta lista
 *     SIEMPRE pasan por MiniMax (no se permiten por cheap-path heurístico).
 */
import { prisma } from "./prisma";
import { COMMAND_IDS, getCommand, type CommandId } from "./commands";

export type AutonomyLevel = "manual" | "approval" | "auto";
export type ExecutionMode = "mock" | "real";
export type CommandRisk = "low" | "medium" | "high";

export type PolicyView = {
  id: string;
  plantId: string;
  autonomyLevel: AutonomyLevel;
  executionMode: ExecutionMode;
  allowedCommands: CommandId[];
  requiredApproverRole: "admin" | "ops";
  maxActionsPerDay: number;
  notes: string | null;
  quietHoursStart: number | null;
  quietHoursEnd: number | null;
  cooldownMinutes: number;
  enabledProviders: string[];
  requireLlmForRisk: CommandRisk[];
  updatedAt: string;
};

export const DEFAULT_POLICY = {
  autonomyLevel: "manual" as AutonomyLevel,
  executionMode: "mock" as ExecutionMode,
  allowedCommands: [] as CommandId[],
  requiredApproverRole: "admin" as const,
  maxActionsPerDay: 10,
  notes: null as string | null,
  quietHoursStart: null as number | null,
  quietHoursEnd: null as number | null,
  cooldownMinutes: 60,
  enabledProviders: [] as string[],
  requireLlmForRisk: ["high"] as CommandRisk[],
};

export async function getOrCreatePolicy(plantId: string) {
  const found = await prisma.plantAutomationPolicy.findUnique({ where: { plantId } });
  if (found) return found;
  return prisma.plantAutomationPolicy.create({
    data: {
      plantId,
      autonomyLevel: DEFAULT_POLICY.autonomyLevel,
      executionMode: DEFAULT_POLICY.executionMode,
      allowedCommands: DEFAULT_POLICY.allowedCommands,
      requiredApproverRole: DEFAULT_POLICY.requiredApproverRole,
      maxActionsPerDay: DEFAULT_POLICY.maxActionsPerDay,
      cooldownMinutes: DEFAULT_POLICY.cooldownMinutes,
      enabledProviders: DEFAULT_POLICY.enabledProviders,
      requireLlmForRisk: DEFAULT_POLICY.requireLlmForRisk,
    },
  });
}

export function isValidCommand(cmd: string): cmd is CommandId {
  return (COMMAND_IDS as string[]).includes(cmd);
}

export function sanitizeCommands(list: unknown): CommandId[] {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(list.filter((x): x is string => typeof x === "string").filter(isValidCommand)),
  );
}

const VALID_RISKS: CommandRisk[] = ["low", "medium", "high"];
export function sanitizeRiskList(list: unknown): CommandRisk[] {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(
      list
        .filter((x): x is string => typeof x === "string")
        .filter((x): x is CommandRisk => (VALID_RISKS as string[]).includes(x)),
    ),
  );
}

const VALID_PROVIDERS = ["growatt", "huawei", "deye", "hoymiles", "srne", "solarman"] as const;
export function sanitizeProviders(list: unknown): string[] {
  if (!Array.isArray(list)) return [];
  return Array.from(
    new Set(
      list
        .filter((x): x is string => typeof x === "string")
        .filter((x) => (VALID_PROVIDERS as readonly string[]).includes(x)),
    ),
  );
}

export function sanitizeHour(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const i = Math.trunc(n);
  if (i < 0 || i > 23) return null;
  return i;
}

export function toPolicyView(row: Awaited<ReturnType<typeof getOrCreatePolicy>>): PolicyView {
  return {
    id: row.id,
    plantId: row.plantId,
    autonomyLevel: (row.autonomyLevel as AutonomyLevel) ?? "manual",
    executionMode: (row.executionMode as ExecutionMode) ?? "mock",
    allowedCommands: sanitizeCommands(row.allowedCommands ?? []),
    requiredApproverRole: (row.requiredApproverRole as "admin" | "ops") ?? "admin",
    maxActionsPerDay: row.maxActionsPerDay ?? 10,
    notes: row.notes ?? null,
    quietHoursStart: row.quietHoursStart ?? null,
    quietHoursEnd: row.quietHoursEnd ?? null,
    cooldownMinutes: row.cooldownMinutes ?? 60,
    enabledProviders: sanitizeProviders(row.enabledProviders ?? []),
    requireLlmForRisk: sanitizeRiskList(row.requireLlmForRisk ?? []),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * ¿La hora actual cae dentro de la ventana quiet hours configurada?
 * Soporta ventanas que cruzan medianoche (ej. start=22, end=5 → 22..23,0..4).
 */
export function isInQuietHours(
  policy: Pick<PolicyView, "quietHoursStart" | "quietHoursEnd">,
  now: Date = new Date(),
  // TZ por defecto: la operación es Colombia. Si en el futuro cada planta
  // tiene su propio TZ se pasa por parámetro.
  timezone = "America/Bogota",
): boolean {
  if (policy.quietHoursStart == null || policy.quietHoursEnd == null) return false;
  // Intl.DateTimeFormat para leer la hora local sin depender de date-fns-tz.
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(now);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? "0");
  const start = policy.quietHoursStart;
  const end = policy.quietHoursEnd;
  if (start === end) return false;
  if (start < end) return hour >= start && hour < end;
  // wrap-around: ej. start=22, end=5 → activo si hour>=22 OR hour<5
  return hour >= start || hour < end;
}

export type PolicyCheck = {
  ok: boolean;
  reason?: string;
  policy: PolicyView;
};

/**
 * ¿La política permite ejecutar `commandId` ahora?
 * Chequea (en orden de "barato → caro"):
 *   1. command está en allowedCommands
 *   2. providerSlug (si se pasa) está en enabledProviders (cuando no vacío)
 *   3. quiet hours
 *   4. cooldown anti-flap
 *   5. cap diario maxActionsPerDay
 */
export async function canExecuteToday(
  plantId: string,
  commandId: string,
  opts: { providerSlug?: string | null; now?: Date } = {},
): Promise<PolicyCheck> {
  const row = await getOrCreatePolicy(plantId);
  const policy = toPolicyView(row);

  if (!policy.allowedCommands.includes(commandId as CommandId)) {
    return { ok: false, reason: `comando ${commandId} no está permitido para esta planta`, policy };
  }

  if (
    opts.providerSlug &&
    policy.enabledProviders.length > 0 &&
    !policy.enabledProviders.includes(opts.providerSlug)
  ) {
    return {
      ok: false,
      reason: `proveedor ${opts.providerSlug} excluido por la política de la planta`,
      policy,
    };
  }

  if (isInQuietHours(policy, opts.now)) {
    return {
      ok: false,
      reason: `dentro de ventana de quiet hours (${policy.quietHoursStart}..${policy.quietHoursEnd})`,
      policy,
    };
  }

  // Cooldown anti-flap: misma planta + mismo commandType ejecutado dentro de cooldown.
  if (policy.cooldownMinutes > 0) {
    const cooldownAgo = new Date(Date.now() - policy.cooldownMinutes * 60_000);
    const recent = await prisma.remediation.findFirst({
      where: {
        plantId,
        commandType: commandId,
        executedAt: { gte: cooldownAgo, not: null },
      },
      select: { executedAt: true },
    });
    if (recent) {
      return {
        ok: false,
        reason: `cooldown activo: último ${commandId} hace <${policy.cooldownMinutes}min`,
        policy,
      };
    }
  }

  // Cap diario: cuenta TODAS las ejecutadas hoy (manuales + auto), no solo del mismo command.
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const count = await prisma.remediation.count({
    where: {
      plantId,
      executedAt: { gte: since, not: null },
    },
  });
  if (count >= policy.maxActionsPerDay) {
    return {
      ok: false,
      reason: `tope diario alcanzado (${count}/${policy.maxActionsPerDay})`,
      policy,
    };
  }

  return { ok: true, policy };
}

/**
 * ¿Para este commandId la política exige LLM (sin permitir cheap-path)?
 * Se consulta desde agent.ts antes de decidir si invocar MiniMax.
 */
export function requiresLlm(policy: PolicyView, commandId: CommandId): boolean {
  const cmd = getCommand(commandId);
  if (!cmd) return true; // safer default: comando desconocido siempre vía LLM
  return policy.requireLlmForRisk.includes(cmd.risk);
}
