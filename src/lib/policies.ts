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
 *   - maxActionsPerDay: circuit-breaker blando.
 */
import { prisma } from "./prisma";
import { COMMAND_IDS, type CommandId } from "./commands";

export type AutonomyLevel = "manual" | "approval" | "auto";
export type ExecutionMode = "mock" | "real";

export type PolicyView = {
  id: string;
  plantId: string;
  autonomyLevel: AutonomyLevel;
  executionMode: ExecutionMode;
  allowedCommands: CommandId[];
  requiredApproverRole: "admin" | "ops";
  maxActionsPerDay: number;
  notes: string | null;
  updatedAt: string;
};

export const DEFAULT_POLICY = {
  autonomyLevel: "manual" as AutonomyLevel,
  executionMode: "mock" as ExecutionMode,
  allowedCommands: [] as CommandId[],
  requiredApproverRole: "admin" as const,
  maxActionsPerDay: 10,
  notes: null as string | null,
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
    },
  });
}

export function isValidCommand(cmd: string): cmd is CommandId {
  return (COMMAND_IDS as string[]).includes(cmd);
}

export function sanitizeCommands(list: unknown): CommandId[] {
  if (!Array.isArray(list)) return [];
  return Array.from(new Set(list.filter((x): x is string => typeof x === "string").filter(isValidCommand)));
}

export function toPolicyView(row: Awaited<ReturnType<typeof getOrCreatePolicy>>): PolicyView {
  return {
    id: row.id,
    plantId: row.plantId,
    autonomyLevel: (row.autonomyLevel as AutonomyLevel) ?? "manual",
    executionMode: (row.executionMode as ExecutionMode) ?? "mock",
    allowedCommands: sanitizeCommands(row.allowedCommands ?? []),
    requiredApproverRole:
      (row.requiredApproverRole as "admin" | "ops") ?? "admin",
    maxActionsPerDay: row.maxActionsPerDay ?? 10,
    notes: row.notes ?? null,
    updatedAt: row.updatedAt.toISOString(),
  };
}

/** ¿La política permite ejecutar `commandId` hoy? Chequea circuit breaker también. */
export async function canExecuteToday(
  plantId: string,
  commandId: string,
): Promise<{ ok: boolean; reason?: string; policy: PolicyView }> {
  const row = await getOrCreatePolicy(plantId);
  const policy = toPolicyView(row);
  if (!policy.allowedCommands.includes(commandId as CommandId)) {
    return { ok: false, reason: `comando ${commandId} no está permitido para esta planta`, policy };
  }
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
