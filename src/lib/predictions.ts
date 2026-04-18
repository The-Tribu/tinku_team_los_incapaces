/**
 * Predictive maintenance.
 * Heuristic ML-lite: analyzes PR trend, voltage stability and uptime over
 * the last 14 days to predict failure probability. MiniMax is then called
 * for a root-cause narrative and an action recommendation.
 */
import { prisma } from "./prisma";
import { chat } from "./minimax";

export type PredictionInput = {
  plantId: string;
  deviceId: string;
  deviceExternalId: string;
  plantName: string;
  plantCode: string;
  capacityKwp: number;
  prTrend: number[]; // daily PR% for last 14 days
  uptimeTrend: number[]; // daily uptime%
  voltageStdDev: number;
  temperatureC: number | null;
  recentAlarmTypes: string[];
};

export type PredictionOutput = {
  predictedType: "failure" | "degradation" | "low_gen";
  probability: number;
  daysToEvent: number;
  confidence: number;
  rootCause: string;
  suggestedAction: string;
  modelVersion: string;
};

function slope(series: number[]): number {
  if (series.length < 2) return 0;
  const n = series.length;
  const xMean = (n - 1) / 2;
  const yMean = series.reduce((s, v) => s + v, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - xMean) * (series[i] - yMean);
    den += (i - xMean) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function heuristicScore(input: PredictionInput): {
  probability: number;
  daysToEvent: number;
  predictedType: PredictionOutput["predictedType"];
  signals: string[];
} {
  const signals: string[] = [];
  let score = 0;

  const prSlope = slope(input.prTrend);
  if (prSlope < -0.5) {
    score += 0.35;
    signals.push(`PR cayendo ${Math.abs(prSlope).toFixed(2)} pp/día`);
  }

  const avgUptime = input.uptimeTrend.reduce((s, v) => s + v, 0) / Math.max(1, input.uptimeTrend.length);
  if (avgUptime < 90) {
    score += 0.25;
    signals.push(`Uptime promedio ${avgUptime.toFixed(1)}% (<90%)`);
  }

  if (input.voltageStdDev > 15) {
    score += 0.2;
    signals.push(`Voltaje inestable (σ=${input.voltageStdDev.toFixed(1)}V)`);
  }

  if ((input.temperatureC ?? 0) > 55) {
    score += 0.15;
    signals.push(`Temperatura alta ${input.temperatureC?.toFixed(1)}°C`);
  }

  if (input.recentAlarmTypes.length > 0) {
    score += 0.1 * Math.min(3, input.recentAlarmTypes.length);
    signals.push(`${input.recentAlarmTypes.length} alarmas recientes`);
  }

  const probability = Math.min(0.98, score);
  const daysToEvent = probability > 0.7 ? 3 : probability > 0.5 ? 7 : probability > 0.3 ? 14 : 30;
  const predictedType: PredictionOutput["predictedType"] =
    prSlope < -0.8 || input.recentAlarmTypes.includes("voltage") ? "failure" :
    avgUptime < 95 ? "degradation" : "low_gen";

  return { probability, daysToEvent, predictedType, signals };
}

export async function generateRootCause(
  input: PredictionInput,
  heuristic: ReturnType<typeof heuristicScore>,
): Promise<Pick<PredictionOutput, "rootCause" | "suggestedAction">> {
  const system = `Eres un ingeniero senior de operaciones solares de Techos Rentables. Diagnosticas fallas en plantas solares antes de que ocurran.
Responde en dos líneas, exactamente con este formato:
CAUSA: <causa raíz técnica en 1-2 frases, en español>
ACCION: <acción concreta, empezando con verbo>
No agregues nada más.`;

  const user = `Planta: ${input.plantName} (${input.plantCode}, ${input.capacityKwp}kWp)
Señales detectadas:
${heuristic.signals.map((s) => `- ${s}`).join("\n")}

Predicción heurística: ${heuristic.predictedType} · probabilidad ${(heuristic.probability * 100).toFixed(0)}% · ventana ${heuristic.daysToEvent} días.
Últimas alarmas: ${input.recentAlarmTypes.join(", ") || "(ninguna)"}.`;

  const raw = await chat(
    [
      { role: "system", content: `${system}\n\n${user}` },
      { role: "user", content: "Diagnóstico:" },
    ],
    { temperature: 0.2, maxTokens: 400 },
  );
  const causa = /CAUSA\s*:\s*([\s\S]*?)(?:\n\s*ACCION|$)/i.exec(raw)?.[1]?.trim() ?? "";
  const accion = /ACCION\s*:\s*([\s\S]*?)$/i.exec(raw)?.[1]?.trim() ?? "";
  if (!causa && !accion) {
    return { rootCause: raw.slice(0, 400), suggestedAction: "Programar inspección preventiva" };
  }
  return { rootCause: causa || raw.slice(0, 200), suggestedAction: accion || "Programar inspección preventiva" };
}

export async function gatherPredictionInput(plantId: string): Promise<PredictionInput[]> {
  const plant = await prisma.plant.findUniqueOrThrow({ where: { id: plantId } });
  const device = await prisma.device.findFirst({
    where: { plantId },
    orderBy: { installedAt: "asc" },
  });
  if (!device) return [];

  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const daily = await prisma.$queryRaw<
    Array<{ day: Date; pr: number; uptime: number; voltage_std: number; temp_avg: number }>
  >`
    SELECT
      date_trunc('day', r.ts)::date                                        AS day,
      (AVG(r.power_ac_kw) / NULLIF(${Number(plant.capacityKwp)}, 0) * 100)::float AS pr,
      (COUNT(*) FILTER (WHERE r.power_ac_kw > 0)::float / NULLIF(COUNT(*), 0) * 100)::float AS uptime,
      COALESCE(STDDEV(r.voltage_v), 0)::float                              AS voltage_std,
      COALESCE(AVG(r.temperature_c), 0)::float                             AS temp_avg
    FROM readings r
    WHERE r.device_id = ${device.id}::uuid AND r.ts >= ${since}
    GROUP BY day
    ORDER BY day ASC
  `;

  const prTrend = daily.map((d) => d.pr ?? 0);
  const uptimeTrend = daily.map((d) => d.uptime ?? 0);
  const voltageStdDev = daily.length > 0 ? daily[daily.length - 1].voltage_std : 0;
  const temperatureC = daily.length > 0 ? daily[daily.length - 1].temp_avg : null;

  const recentAlarms = await prisma.alarm.findMany({
    where: { deviceId: device.id, startedAt: { gte: since } },
    select: { type: true },
  });

  return [
    {
      plantId: plant.id,
      deviceId: device.id,
      deviceExternalId: device.externalId,
      plantName: plant.name,
      plantCode: plant.code,
      capacityKwp: Number(plant.capacityKwp ?? 0),
      prTrend,
      uptimeTrend,
      voltageStdDev,
      temperatureC,
      recentAlarmTypes: recentAlarms.map((a) => a.type),
    },
  ];
}

export async function predictForPlant(plantId: string): Promise<PredictionOutput[]> {
  const inputs = await gatherPredictionInput(plantId);
  const results: PredictionOutput[] = [];
  for (const input of inputs) {
    const heuristic = heuristicScore(input);
    let rootCauseBlock: Pick<PredictionOutput, "rootCause" | "suggestedAction">;
    try {
      rootCauseBlock = await generateRootCause(input, heuristic);
    } catch (err) {
      rootCauseBlock = {
        rootCause: `(IA no disponible: ${(err as Error).message.slice(0, 80)}) Señales: ${heuristic.signals.join("; ") || "sin anomalías"}`,
        suggestedAction: heuristic.probability > 0.5 ? "Programar inspección preventiva" : "Mantener monitoreo activo",
      };
    }
    const prediction: PredictionOutput = {
      ...rootCauseBlock,
      predictedType: heuristic.predictedType,
      probability: heuristic.probability,
      daysToEvent: heuristic.daysToEvent,
      confidence: 0.7,
      modelVersion: "heuristic-v1+minimax",
    };
    await prisma.prediction.create({
      data: {
        deviceId: input.deviceId,
        predictedType: prediction.predictedType,
        probability: prediction.probability,
        daysToEvent: prediction.daysToEvent,
        confidence: prediction.confidence,
        rootCause: prediction.rootCause,
        suggestedAction: prediction.suggestedAction,
        modelVersion: prediction.modelVersion,
      },
    });
    results.push(prediction);
  }
  return results;
}
