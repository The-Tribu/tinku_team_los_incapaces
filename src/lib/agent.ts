/**
 * SunHub · Self-repair agent.
 *
 * `decideRemediation()` recibe el contexto de una alarma (con su planta,
 * device, política y memoria reciente) y devuelve una decisión:
 *   - { action: "propose", commandId, rationale, confidence }
 *   - { action: "skip", reason }
 *
 * Filosofía:
 *   1. Kill-switch global vía env SELF_REPAIR_DISABLED.
 *   2. Si la política es "manual" → skip sin llamar LLM (cero ruido).
 *   3. Cheap path: si la heurística devuelve 1 solo candidato con confidence
 *      >= AGENT_CHEAP_PATH_THRESHOLD y NO está en requireLlmForRisk → propose
 *      directo (ahorro de tokens y rate-limit).
 *   4. En cualquier otro caso → MiniMax JSON-mode con prompt estructurado que
 *      ve candidatos, política, alarma, historia reciente del device.
 *
 * Toda decisión (propose/skip, con o sin LLM) queda registrada en
 * `agent_decisions` para auditoría posterior. El caller le pasa luego el
 * `remediationId` con `linkAgentDecisionToRemediation()` cuando corresponda.
 */
import { prisma } from "./prisma";
import { chatJSON, MiniMaxError } from "./minimax";
import {
  COMMANDS,
  getCommand,
  suggestCandidatesForAlarm,
  type CandidateSuggestion,
  type CommandId,
} from "./commands";
import { requiresLlm, type PolicyView } from "./policies";

const CHEAP_PATH_THRESHOLD = Number(process.env.AGENT_CHEAP_PATH_THRESHOLD ?? 0.8);
const AGENT_MODEL_VERSION = "agent-v1+minimax";

export type AgentAlarmContext = {
  id: string;
  type: string;
  severity: "critical" | "warning" | "info";
  source: string;
  message: string;
  startedAt: Date | string;
};

export type AgentPlantContext = {
  id: string;
  name: string;
  code: string;
  capacityKwp: number | null;
};

export type AgentDeviceContext = {
  id: string;
  externalId: string;
  providerSlug: string;
  kind: string;
  currentStatus: string;
};

export type AgentDecideInput = {
  alarm: AgentAlarmContext;
  plant: AgentPlantContext;
  device: AgentDeviceContext;
  policy: PolicyView;
  predictionId?: string | null;
};

export type AgentDecisionResult =
  | {
      action: "propose";
      commandId: CommandId;
      rationale: string;
      confidence: number;
      llmUsed: boolean;
      candidates: CandidateSuggestion[];
      decisionId: string;
    }
  | {
      action: "skip";
      reason: string;
      llmUsed: boolean;
      candidates: CandidateSuggestion[];
      decisionId: string;
    };

function killSwitchEnabled(): boolean {
  const v = process.env.SELF_REPAIR_DISABLED;
  if (!v) return false;
  return v === "1" || v.toLowerCase() === "true";
}

/** Devuelve los candidatos heurísticos filtrados por allowedCommands + supportedProviders. */
export function shortlistCandidates(
  alarm: AgentAlarmContext,
  policy: PolicyView,
  providerSlug: string,
): CandidateSuggestion[] {
  const raw = suggestCandidatesForAlarm({
    type: alarm.type,
    severity: alarm.severity,
    message: alarm.message,
  });
  return raw.filter((c) => {
    if (!policy.allowedCommands.includes(c.id)) return false;
    const def = getCommand(c.id);
    if (!def) return false;
    return def.supportedProviders.includes(providerSlug);
  });
}

async function loadDeviceMemory(deviceId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recentAlarms, recentRemediations, lastOutcomes] = await Promise.all([
    prisma.alarm.findMany({
      where: { deviceId, startedAt: { gte: since } },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: { type: true, severity: true, startedAt: true, resolvedAt: true, message: true },
    }),
    prisma.remediation.findMany({
      where: { deviceId, executedAt: { not: null, gte: since } },
      orderBy: { executedAt: "desc" },
      take: 5,
      select: {
        commandType: true,
        status: true,
        verifiedOutcome: true,
        executedAt: true,
        executionMode: true,
      },
    }),
    prisma.predictionOutcome.findMany({
      where: { prediction: { deviceId } },
      orderBy: { decidedAt: "desc" },
      take: 3,
      include: {
        prediction: { select: { predictedType: true, suggestedAction: true } },
      },
    }),
  ]);
  return { recentAlarms, recentRemediations, lastOutcomes };
}

type LlmAgentDecision = {
  action: "propose" | "skip";
  command_id?: string;
  rationale: string;
  confidence?: number;
};

async function askLlm(
  input: AgentDecideInput,
  candidates: CandidateSuggestion[],
  memory: Awaited<ReturnType<typeof loadDeviceMemory>>,
): Promise<LlmAgentDecision> {
  const allowed = input.policy.allowedCommands
    .map((id) => {
      const def = getCommand(id);
      return def
        ? `- ${def.id} (riesgo ${def.risk}): ${def.description}`
        : `- ${id} (desconocido)`;
    })
    .join("\n");

  const candidatesBlock =
    candidates.length > 0
      ? candidates
          .map(
            (c) =>
              `- ${c.id} · confianza heurística ${(c.confidence * 100).toFixed(0)}% — ${c.rationale}`,
          )
          .join("\n")
      : "(ninguno)";

  const alarmsBlock =
    memory.recentAlarms.length > 0
      ? memory.recentAlarms
          .map((a) => {
            const status = a.resolvedAt ? "resuelta" : "activa";
            return `- ${a.severity}/${a.type} · ${status} · ${a.message.slice(0, 120)}`;
          })
          .join("\n")
      : "(sin alarmas previas en 30d)";

  const remediationsBlock =
    memory.recentRemediations.length > 0
      ? memory.recentRemediations
          .map((r) => {
            const result = r.verifiedOutcome ?? r.status;
            return `- ${r.commandType} (${r.executionMode}) → ${result} @ ${r.executedAt?.toISOString().slice(0, 16) ?? "?"}`;
          })
          .join("\n")
      : "(sin remediaciones previas)";

  const system = `Eres el agente de auto-reparación de SunHub para plantas solares. Tu trabajo es decidir si una alarma justifica ejecutar un comando correctivo automáticamente o si conviene esperar/escalar.

REGLAS DURAS (no negociables):
- Solo puedes elegir un comando que aparezca en "Comandos permitidos por la planta".
- Si dudas o si la condición es transitoria probable → action="skip".
- Si en la memoria reciente el mismo comando ya falló o no tuvo efecto → propone otro o skip.
- Para alarmas severity=info casi siempre debes hacer skip.
- Confianza mínima para proponer: 0.55. Por debajo de eso → skip.
- Tu rationale debe ser una línea en español, citando evidencia (no genérico).

Devuelve EXCLUSIVAMENTE un JSON con esta forma:
{"action":"propose","command_id":"<id>","rationale":"<una línea>","confidence":<0..1>}
o
{"action":"skip","rationale":"<por qué no actuar>"}`;

  const user = `Planta: ${input.plant.name} (${input.plant.code}, ${input.plant.capacityKwp ?? "?"} kWp)
Dispositivo: ${input.device.externalId} · proveedor ${input.device.providerSlug} · status ${input.device.currentStatus}

Alarma activa:
- severity: ${input.alarm.severity}
- type: ${input.alarm.type}
- source: ${input.alarm.source}
- mensaje: ${input.alarm.message}
- desde: ${typeof input.alarm.startedAt === "string" ? input.alarm.startedAt : input.alarm.startedAt.toISOString()}

Comandos permitidos por la planta:
${allowed || "(ninguno — la política está restrictiva)"}

Candidatos heurísticos (pre-filtrados):
${candidatesBlock}

Política activa:
- modo ejecución: ${input.policy.executionMode}
- nivel autonomía: ${input.policy.autonomyLevel}
- cap diario: ${input.policy.maxActionsPerDay}
- cooldown: ${input.policy.cooldownMinutes}min
- requiere LLM para riesgos: ${input.policy.requireLlmForRisk.join(", ") || "(ninguno)"}

Historial 30d del dispositivo:
Alarmas:
${alarmsBlock}
Remediaciones:
${remediationsBlock}

Decide:`;

  return chatJSON<LlmAgentDecision>(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.1, maxTokens: 300 },
  );
}

async function recordDecision(
  input: AgentDecideInput,
  outcome: { action: "propose" | "skip"; commandId?: string; rationale: string; confidence: number | null; llmUsed: boolean },
): Promise<string> {
  const row = await prisma.agentDecision.create({
    data: {
      plantId: input.plant.id,
      alarmId: input.alarm.id,
      predictionId: input.predictionId ?? null,
      action: outcome.action,
      commandId: outcome.commandId ?? null,
      rationale: outcome.rationale,
      confidence: outcome.confidence ?? null,
      llmUsed: outcome.llmUsed,
      modelVersion: outcome.llmUsed ? AGENT_MODEL_VERSION : "heuristic-only",
    },
  });
  return row.id;
}

/** Marca una AgentDecision con el remediationId que terminó creando. */
export async function linkAgentDecisionToRemediation(decisionId: string, remediationId: string) {
  await prisma.agentDecision.update({
    where: { id: decisionId },
    data: { remediationId },
  });
}

/**
 * Decisión principal del agente. Idempotencia: si llamás dos veces para la
 * misma alarma vas a obtener dos decisions registradas — el caller debería
 * deduplicar antes (ver `alreadyDecidedFor()`).
 */
export async function decideRemediation(
  input: AgentDecideInput,
): Promise<AgentDecisionResult> {
  // Kill switch global
  if (killSwitchEnabled()) {
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: "self-repair deshabilitado por env SELF_REPAIR_DISABLED",
      confidence: null,
      llmUsed: false,
    });
    return {
      action: "skip",
      reason: "kill-switch activo (SELF_REPAIR_DISABLED=1)",
      llmUsed: false,
      candidates: [],
      decisionId,
    };
  }

  // Política manual: ni siquiera invocamos al agente.
  if (input.policy.autonomyLevel === "manual") {
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: "política=manual: el operador decide sin sugerencias automáticas",
      confidence: null,
      llmUsed: false,
    });
    return {
      action: "skip",
      reason: "policy.autonomyLevel=manual",
      llmUsed: false,
      candidates: [],
      decisionId,
    };
  }

  const candidates = shortlistCandidates(
    input.alarm,
    input.policy,
    input.device.providerSlug,
  );

  // Sin candidatos válidos: igual consultamos al LLM SOLO si severity != info,
  // por si el modelo conoce algo de la memoria. Para info simplemente skip.
  if (candidates.length === 0 && input.alarm.severity === "info") {
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: "sin candidatos heurísticos y severity=info — no actuar",
      confidence: null,
      llmUsed: false,
    });
    return {
      action: "skip",
      reason: "no-candidates-info-severity",
      llmUsed: false,
      candidates,
      decisionId,
    };
  }

  // Cheap path: 1 candidato sólido y la política no obliga LLM para su riesgo.
  if (candidates.length === 1 && candidates[0].confidence >= CHEAP_PATH_THRESHOLD) {
    const top = candidates[0];
    if (!requiresLlm(input.policy, top.id)) {
      const decisionId = await recordDecision(input, {
        action: "propose",
        commandId: top.id,
        rationale: top.rationale,
        confidence: top.confidence,
        llmUsed: false,
      });
      return {
        action: "propose",
        commandId: top.id,
        rationale: top.rationale,
        confidence: top.confidence,
        llmUsed: false,
        candidates,
        decisionId,
      };
    }
  }

  // LLM path
  const memory = await loadDeviceMemory(input.device.id);
  let llmRaw: LlmAgentDecision;
  try {
    llmRaw = await askLlm(input, candidates, memory);
  } catch (err) {
    // Si MiniMax falla, NO inventamos un comando. Skip con auditoría.
    const why =
      err instanceof MiniMaxError
        ? `MiniMax ${err.status}`
        : (err as Error).message.slice(0, 120);
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: `LLM no disponible (${why}); decisión conservadora.`,
      confidence: null,
      llmUsed: false,
    });
    return {
      action: "skip",
      reason: `llm-error: ${why}`,
      llmUsed: false,
      candidates,
      decisionId,
    };
  }

  // Validación de la respuesta del modelo
  if (llmRaw.action === "skip") {
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: llmRaw.rationale?.slice(0, 400) ?? "(sin justificación del modelo)",
      confidence: typeof llmRaw.confidence === "number" ? llmRaw.confidence : null,
      llmUsed: true,
    });
    return {
      action: "skip",
      reason: llmRaw.rationale ?? "llm-skip",
      llmUsed: true,
      candidates,
      decisionId,
    };
  }

  const proposedId = (llmRaw.command_id ?? "") as string;
  if (!isCommandId(proposedId)) {
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: `LLM propuso commandId inválido (${proposedId}); rechazado.`,
      confidence: null,
      llmUsed: true,
    });
    return {
      action: "skip",
      reason: `llm-invalid-command: ${proposedId}`,
      llmUsed: true,
      candidates,
      decisionId,
    };
  }
  if (!input.policy.allowedCommands.includes(proposedId)) {
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: `LLM propuso ${proposedId} pero la política no lo permite.`,
      confidence: null,
      llmUsed: true,
    });
    return {
      action: "skip",
      reason: `llm-command-not-allowed: ${proposedId}`,
      llmUsed: true,
      candidates,
      decisionId,
    };
  }
  const def = getCommand(proposedId)!;
  if (!def.supportedProviders.includes(input.device.providerSlug)) {
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: `Comando ${proposedId} no es soportado para ${input.device.providerSlug}.`,
      confidence: null,
      llmUsed: true,
    });
    return {
      action: "skip",
      reason: `llm-provider-unsupported: ${proposedId}/${input.device.providerSlug}`,
      llmUsed: true,
      candidates,
      decisionId,
    };
  }

  const confidence = clamp01(typeof llmRaw.confidence === "number" ? llmRaw.confidence : 0.6);
  if (confidence < 0.55) {
    const decisionId = await recordDecision(input, {
      action: "skip",
      rationale: `LLM con confianza ${confidence.toFixed(2)} (<0.55); no actuar.`,
      confidence,
      llmUsed: true,
    });
    return {
      action: "skip",
      reason: `llm-low-confidence: ${confidence.toFixed(2)}`,
      llmUsed: true,
      candidates,
      decisionId,
    };
  }

  const rationale = (llmRaw.rationale ?? "").slice(0, 400) || "(LLM sin justificación)";
  const decisionId = await recordDecision(input, {
    action: "propose",
    commandId: proposedId,
    rationale,
    confidence,
    llmUsed: true,
  });
  return {
    action: "propose",
    commandId: proposedId,
    rationale,
    confidence,
    llmUsed: true,
    candidates,
    decisionId,
  };
}

function isCommandId(s: string): s is CommandId {
  return s in COMMANDS;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  if (n < 0) return 0;
  if (n > 1) return 1;
  return n;
}

/** ¿Ya existe una decisión del agente para esta alarma? Evita duplicados al llamar varias veces. */
export async function alreadyDecidedFor(alarmId: string): Promise<boolean> {
  const c = await prisma.agentDecision.count({ where: { alarmId } });
  return c > 0;
}
