/**
 * Monthly report synthesis.
 * Aggregates Readings + Contract targets for a plant-or-client over a period,
 * computes compliance, and asks MiniMax for an executive narrative.
 */
import { prisma } from "./prisma";
import { chat } from "./minimax";

export type ReportMetrics = {
  periodLabel: string;
  energyKwh: number;
  targetEnergyKwh: number;
  uptimePct: number;
  targetUptimePct: number;
  prPct: number;
  targetPrPct: number;
  co2Ton: number;
  targetCo2Ton: number;
  savingsCop: number;
  targetSavingsCop: number;
  compliancePct: number;
  penaltyExposureCop: number;
};

export async function computeReportMetrics(
  plantId: string,
  period: Date,
): Promise<ReportMetrics> {
  const periodStart = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth(), 1));
  const periodEnd = new Date(Date.UTC(period.getUTCFullYear(), period.getUTCMonth() + 1, 1));

  const [plant, contract, readingsAgg, deviceCount] = await Promise.all([
    prisma.plant.findUniqueOrThrow({ where: { id: plantId } }),
    prisma.contract.findUnique({
      where: { plantId_periodMonth: { plantId, periodMonth: periodStart } },
    }),
    prisma.$queryRaw<
      Array<{ energy: number; avg_power: number; samples: number; online_samples: number }>
    >`
      SELECT
        COALESCE(MAX(r.energy_kwh), 0)::float                  AS energy,
        COALESCE(AVG(r.power_ac_kw), 0)::float                AS avg_power,
        COUNT(*)::int                                          AS samples,
        COUNT(*) FILTER (WHERE r.power_ac_kw > 0)::int         AS online_samples
      FROM readings r
      JOIN devices d ON d.id = r.device_id
      WHERE d.plant_id = ${plantId}::uuid
        AND r.ts >= ${periodStart}
        AND r.ts <  ${periodEnd}
    `,
    prisma.device.count({ where: { plantId } }),
  ]);

  const row = readingsAgg[0] ?? { energy: 0, avg_power: 0, samples: 0, online_samples: 0 };
  const capacity = Number(plant.capacityKwp ?? 0);
  // Readings rows are per-device snapshots; we approximate accumulated energy
  // by summing across devices. In a real deployment we'd compute deltas.
  const energyKwh =
    deviceCount > 0 ? (row.avg_power * 24 * (periodEnd.getUTCDate())) : 0;
  const uptimePct = row.samples > 0 ? (row.online_samples / row.samples) * 100 : 0;
  const prPct = capacity > 0 ? (row.avg_power / capacity) * 100 : 0;
  const co2Ton = (energyKwh * 0.164) / 1000;
  const savingsCop = energyKwh * 680;

  const targetEnergy = Number(contract?.targetEnergyKwh ?? 0);
  const targetUptime = Number(contract?.targetUptimePct ?? 98);
  const targetPr = Number(contract?.targetPrPct ?? 78);
  const targetCo2 = Number(contract?.targetCo2Ton ?? 0);
  const targetSavings = Number(contract?.targetSavingsCop ?? 0);
  const penalty = Number(contract?.penaltyPerBreach ?? 0);

  const compliance =
    targetEnergy > 0
      ? (0.5 * Math.min(1, energyKwh / targetEnergy) +
          0.25 * Math.min(1, uptimePct / targetUptime) +
          0.25 * Math.min(1, prPct / targetPr)) *
        100
      : 0;

  return {
    periodLabel: periodStart.toLocaleDateString("es-CO", { month: "long", year: "numeric" }),
    energyKwh,
    targetEnergyKwh: targetEnergy,
    uptimePct,
    targetUptimePct: targetUptime,
    prPct,
    targetPrPct: targetPr,
    co2Ton,
    targetCo2Ton: targetCo2,
    savingsCop,
    targetSavingsCop: targetSavings,
    compliancePct: compliance,
    penaltyExposureCop: compliance < 95 ? penalty : 0,
  };
}

export async function generateNarrative(
  plantName: string,
  client: string,
  metrics: ReportMetrics,
): Promise<string> {
  const system = `Eres un operador senior de Techos Rentables escribiendo el reporte mensual de una planta solar.
Escribe en español, 3 párrafos cortos:
1) Qué pasó (cumplimiento energético + uptime).
2) Qué riesgos se detectaron y qué acciones se tomaron.
3) Recomendaciones para el próximo mes.
Usa los números exactos que te doy y evita rellenos de marketing. Nunca inventes datos que no te pasé.`;
  const user = `Planta: ${plantName} (cliente ${client}, periodo ${metrics.periodLabel}).
Energía generada: ${metrics.energyKwh.toFixed(0)} kWh / meta ${metrics.targetEnergyKwh.toFixed(0)} kWh.
Uptime: ${metrics.uptimePct.toFixed(1)}% / meta ${metrics.targetUptimePct.toFixed(1)}%.
PR: ${metrics.prPct.toFixed(1)}% / meta ${metrics.targetPrPct.toFixed(1)}%.
Ahorro: $${metrics.savingsCop.toLocaleString("es-CO")} COP / meta $${metrics.targetSavingsCop.toLocaleString("es-CO")} COP.
CO₂ evitado: ${metrics.co2Ton.toFixed(2)} ton.
Cumplimiento global: ${metrics.compliancePct.toFixed(1)}%.
Exposición a penalización: $${metrics.penaltyExposureCop.toLocaleString("es-CO")} COP.`;

  return chat(
    [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    { temperature: 0.3, maxTokens: 700 },
  );
}
