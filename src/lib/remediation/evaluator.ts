/**
 * Evaluator: for a given device, find open non-resolved alarms and try to
 * auto-remediate each. Safe to call on every ingest tick because the executor
 * enforces cooldown + max attempts.
 */
import { prisma } from "../prisma";
import { executeRemediation, type ExecutionResult } from "./executor";

export async function evaluateRemediation(deviceId: string): Promise<ExecutionResult[]> {
  const alarms = await prisma.alarm.findMany({
    where: {
      deviceId,
      resolvedAt: null,
      requiresHuman: false,
      severity: { in: ["warning", "info"] },
    },
    orderBy: { startedAt: "asc" },
  });
  const out: ExecutionResult[] = [];
  for (const alarm of alarms) {
    const result = await executeRemediation(alarm.id, "rule_engine");
    out.push(result);
  }
  return out;
}
