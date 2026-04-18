/**
 * Optional LLM-based decision layer for remediation.
 *
 * Activated only when:
 *   - env `REMEDIATION_AI_AGENT=1`
 *   - the policy matched has `requiresAiDecision=true`
 *
 * The policy engine calls `decideRemediation()` with context (alarm + recent
 * readings + recent attempts). The model is asked to pick ONE of an allowlisted
 * set of actions OR return `none`. If confidence < threshold, the caller
 * falls back to the policy default action (or skips when policy has no safe
 * default).
 */
import { chatJSON } from "../minimax";
import { prisma } from "../prisma";

export type AiAllowedAction =
  | "restart_inverter"
  | "set_power_limit"
  | "toggle_mppt"
  | "clear_fault"
  | "set_work_mode"
  | "none";

const ALLOWLIST: ReadonlySet<AiAllowedAction> = new Set([
  "restart_inverter",
  "set_power_limit",
  "toggle_mppt",
  "clear_fault",
  "set_work_mode",
  "none",
]);

const CONFIDENCE_THRESHOLD = 0.7;

export type AiDecision = {
  action: AiAllowedAction;
  confidence: number;
  reasoning: string;
  used: boolean; // false if agent disabled or decision rejected
};

export function aiAgentEnabled(): boolean {
  return process.env.REMEDIATION_AI_AGENT === "1";
}

export async function decideRemediation(alarmId: string): Promise<AiDecision> {
  if (!aiAgentEnabled()) {
    return { action: "none", confidence: 0, reasoning: "agent disabled", used: false };
  }

  const alarm = await prisma.alarm.findUnique({
    where: { id: alarmId },
    include: {
      device: { include: { plant: true, provider: true } },
      remediations: {
        orderBy: { executedAt: "desc" },
        take: 3,
        select: { actionType: true, outcome: true, status: true, executedAt: true },
      },
    },
  });
  if (!alarm) return { action: "none", confidence: 0, reasoning: "alarm not found", used: false };

  const since = new Date(Date.now() - 2 * 60 * 60_000);
  const readings = await prisma.reading.findMany({
    where: { deviceId: alarm.deviceId, ts: { gte: since } },
    orderBy: { ts: "desc" },
    take: 24,
    select: { ts: true, powerAcKw: true, voltageV: true, frequencyHz: true, temperatureC: true },
  });

  const prompt = {
    alarm: {
      type: alarm.type,
      severity: alarm.severity,
      message: alarm.message,
      startedAt: alarm.startedAt.toISOString(),
    },
    plant: { name: alarm.device.plant.name, capacityKwp: alarm.device.plant.capacityKwp },
    provider: alarm.device.provider.slug,
    recentReadings: readings.map((r) => ({
      ts: r.ts.toISOString(),
      powerKw: r.powerAcKw ? Number(r.powerAcKw) : null,
      voltageV: r.voltageV ? Number(r.voltageV) : null,
      frequencyHz: r.frequencyHz ? Number(r.frequencyHz) : null,
      temperatureC: r.temperatureC ? Number(r.temperatureC) : null,
    })),
    recentAttempts: alarm.remediations,
  };

  let raw: { action?: string; confidence?: number; reasoning?: string };
  try {
    raw = await chatJSON<{ action?: string; confidence?: number; reasoning?: string }>([
      {
        role: "system",
        content:
          "Eres un agente de operaciones de plantas solares. Tu única tarea es recomendar UNA acción correctiva segura a partir de esta lista exacta: restart_inverter, set_power_limit, toggle_mppt, clear_fault, set_work_mode, none. Responde SOLO en JSON con las claves action (string), confidence (0..1), reasoning (string breve).",
      },
      {
        role: "user",
        content: JSON.stringify(prompt),
      },
    ]);
  } catch (err) {
    return {
      action: "none",
      confidence: 0,
      reasoning: `ai error: ${(err as Error).message}`,
      used: false,
    };
  }

  const action = (raw.action ?? "none").toLowerCase() as AiAllowedAction;
  const confidence = Math.max(0, Math.min(1, Number(raw.confidence ?? 0)));
  const reasoning = typeof raw.reasoning === "string" ? raw.reasoning : "(sin detalle)";

  if (!ALLOWLIST.has(action)) {
    return { action: "none", confidence: 0, reasoning: `acción inválida: ${raw.action}`, used: false };
  }
  if (confidence < CONFIDENCE_THRESHOLD) {
    return { action: "none", confidence, reasoning: `low confidence: ${reasoning}`, used: false };
  }
  return { action, confidence, reasoning, used: true };
}
