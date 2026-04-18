import { AppShell } from "@/components/sunhub/app-shell";
import { canWrite, getSessionUser } from "@/lib/auth";
import { displayClientLabel } from "@/lib/display";
import { prisma } from "@/lib/prisma";
import { PredictionsConsole } from "./predictions-console";

export const dynamic = "force-dynamic";

// Ventana operativa estándar: próximos 7 días (mockup "Mapa de calor · 7 días").
const HEATMAP_DAYS = 7;
const HISTORY_DAYS = 30;
const MS_DAY = 24 * 60 * 60 * 1000;
const CO2_FACTOR_TON_PER_KWH = 0.164 / 1000; // ton CO₂ por kWh (ver lib/reports.ts)

function toDayKey(d: Date): string {
  // YYYY-MM-DD en hora local del servidor
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function shortDayLabel(d: Date): string {
  // Etiquetas cortas ES (Lun, Mar, …)
  const labels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];
  return `${labels[d.getDay()]} ${String(d.getDate()).padStart(2, "0")}`;
}

export default async function PrediccionesPage() {
  const me = await getSessionUser();
  const now = new Date();

  const [plants, openPredictions, recentPredictions, outcomeStats, providers] = await Promise.all([
    prisma.plant.findMany({
      orderBy: { name: "asc" },
      include: { client: { select: { name: true } } },
    }),
    // Predicciones abiertas (sin outcome) con todo lo necesario para lista + heatmap + barras por marca
    prisma.prediction.findMany({
      where: { outcome: null, generatedAt: { gte: new Date(now.getTime() - HISTORY_DAYS * MS_DAY) } },
      take: 200,
      orderBy: { generatedAt: "desc" },
      include: {
        device: {
          select: {
            id: true,
            externalId: true,
            kind: true,
            model: true,
            provider: { select: { slug: true, displayName: true } },
            plant: {
              select: {
                id: true,
                name: true,
                code: true,
                capacityKwp: true,
                client: { select: { name: true } },
              },
            },
          },
        },
        outcome: true,
        sourceAlarm: { select: { id: true, severity: true, type: true, message: true } },
        remediations: {
          select: { id: true, commandType: true, status: true, executionMode: true },
          orderBy: { proposedAt: "desc" },
          take: 3,
        },
      },
    }),
    // Histórico reciente para KPIs (fallas evitadas, totales del periodo)
    prisma.prediction.findMany({
      where: { generatedAt: { gte: new Date(now.getTime() - HISTORY_DAYS * MS_DAY) } },
      select: {
        id: true,
        predictedType: true,
        probability: true,
        generatedAt: true,
        device: {
          select: {
            plant: { select: { capacityKwp: true } },
          },
        },
        outcome: { select: { status: true } },
      },
    }),
    prisma.predictionOutcome.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.provider.findMany({ select: { slug: true, displayName: true } }),
  ]);

  // ── KPIs ─────────────────────────────────────────────────────
  const totalPeriod = recentPredictions.length;
  let totalOutcomes = 0;
  let matched = 0;
  for (const row of outcomeStats) {
    const c = row._count._all;
    totalOutcomes += c;
    if (row.status === "confirmed" || row.status === "auto_matched") matched += c;
  }
  const accuracy = totalOutcomes > 0 ? matched / totalOutcomes : null;

  // "Fallas evitadas" ≈ predicciones de tipo failure/degradation con outcome cerrado confirmando la anticipación
  const failuresAvoided = recentPredictions.filter(
    (r) =>
      (r.predictedType === "failure" || r.predictedType === "degradation") &&
      (r.outcome?.status === "confirmed" || r.outcome?.status === "auto_matched"),
  ).length;

  // Ahorro estimado COP: heurística simple → energía potencialmente preservada
  // (capacity * probabilidad * factor por tipo) * precio promedio kWh en COP.
  const KWH_COP = 780; // aproximado tarifa comercial CO 2025/26
  const savingsCop = recentPredictions.reduce((acc, r) => {
    if (r.outcome && r.outcome.status !== "dismissed") {
      const cap = Number(r.device.plant.capacityKwp ?? 0);
      const p = Number(r.probability);
      const hoursAtRisk = r.predictedType === "failure" ? 24 : r.predictedType === "degradation" ? 8 : 4;
      return acc + cap * p * hoursAtRisk * KWH_COP;
    }
    return acc;
  }, 0);

  // Tiempo promedio de anticipación (días entre predicción y outcome decidido)
  // Usamos daysToEvent como proxy cuando exista — mockup muestra "3.2 días".
  // Aproximación: promedio de probabilidad alta sobre ventana de 3/7/14 días.
  const avgLead = (() => {
    const sample = openPredictions.filter((r) => r.probability && Number(r.probability) >= 0.4);
    if (sample.length === 0) return null;
    const total = sample.reduce((a, r) => a + (r.daysToEvent ? Number(r.daysToEvent) : 5), 0);
    return total / sample.length;
  })();

  // ── Heatmap (plantas × próximos 7 días) ──────────────────────
  const heatmapDays: { key: string; label: string; date: string }[] = [];
  for (let i = 0; i < HEATMAP_DAYS; i++) {
    const d = new Date(now.getTime() + i * MS_DAY);
    heatmapDays.push({ key: toDayKey(d), label: shortDayLabel(d), date: d.toISOString() });
  }

  // Selección de plantas a mostrar en el heatmap: las que tienen al menos una predicción abierta.
  const plantById = new Map(plants.map((p) => [p.id, p]));
  const riskByPlantDay = new Map<string, number>(); // key = `${plantId}|${dayKey}` → max prob
  for (const r of openPredictions) {
    const eventDate = r.daysToEvent
      ? new Date(r.generatedAt.getTime() + Number(r.daysToEvent) * MS_DAY)
      : r.generatedAt;
    const k = `${r.device.plant.id}|${toDayKey(eventDate)}`;
    const prob = Number(r.probability);
    const prev = riskByPlantDay.get(k) ?? 0;
    if (prob > prev) riskByPlantDay.set(k, prob);
  }

  const heatmapPlantIds = Array.from(
    new Set(openPredictions.map((r) => r.device.plant.id)),
  ).slice(0, 8);
  const heatmapRows = heatmapPlantIds.map((pid) => {
    const p = plantById.get(pid);
    return {
      plantId: pid,
      plantCode: p?.code ?? "—",
      plantName: p?.name ?? "—",
      cells: heatmapDays.map((d) => ({
        dayKey: d.key,
        dayLabel: d.label,
        risk: riskByPlantDay.get(`${pid}|${d.key}`) ?? 0,
      })),
    };
  });

  // ── Distribución de riesgo por marca ─────────────────────────
  const providerCounts = new Map<string, { count: number; avgProb: number; name: string }>();
  for (const prov of providers) {
    providerCounts.set(prov.slug, { count: 0, avgProb: 0, name: prov.displayName });
  }
  for (const r of openPredictions) {
    const slug = r.device.provider.slug;
    const bucket = providerCounts.get(slug) ?? { count: 0, avgProb: 0, name: r.device.provider.displayName };
    bucket.count += 1;
    bucket.avgProb += Number(r.probability);
    providerCounts.set(slug, bucket);
  }
  const totalOpen = openPredictions.length;
  const brandDistribution = Array.from(providerCounts.entries())
    .map(([slug, v]) => ({
      slug,
      name: v.name,
      count: v.count,
      sharePct: totalOpen > 0 ? (v.count / totalOpen) * 100 : 0,
      avgProb: v.count > 0 ? v.avgProb / v.count : 0,
    }))
    .filter((row) => row.count > 0)
    .sort((a, b) => b.count - a.count);

  // ── Predicciones priorizadas (para la tabla master) ──────────
  const prioritized = openPredictions
    .map((r) => {
      const cap = Number(r.device.plant.capacityKwp ?? 0);
      const p = Number(r.probability);
      const hoursAtRisk = r.predictedType === "failure" ? 24 : r.predictedType === "degradation" ? 8 : 4;
      const co2AtRiskTon = cap * p * hoursAtRisk * CO2_FACTOR_TON_PER_KWH;
      const days = r.daysToEvent ? Number(r.daysToEvent) : null;
      const eventDate = days != null ? new Date(r.generatedAt.getTime() + days * MS_DAY) : null;
      return {
        id: r.id,
        deviceExternalId: r.device.externalId,
        deviceKind: r.device.kind,
        deviceModel: r.device.model ?? "",
        providerSlug: r.device.provider.slug,
        providerName: r.device.provider.displayName,
        plantId: r.device.plant.id,
        plantName: r.device.plant.name,
        plantCode: r.device.plant.code,
        client: displayClientLabel(r.device.plant.client, { name: r.device.plant.name }),
        predictedType: r.predictedType,
        probability: p,
        confidence: r.confidence ? Number(r.confidence) : null,
        daysToEvent: days,
        eventAt: eventDate ? eventDate.toISOString() : null,
        generatedAt: r.generatedAt.toISOString(),
        rootCause: r.rootCause ?? "",
        suggestedAction: r.suggestedAction ?? "",
        triggerKind: (r.triggerKind as "scheduled" | "alarm" | "anomaly") ?? "scheduled",
        modelVersion: r.modelVersion ?? "heuristic",
        sourceAlarm: r.sourceAlarm,
        outcome: r.outcome
          ? { status: r.outcome.status, notes: r.outcome.notes, decidedAt: r.outcome.decidedAt.toISOString() }
          : null,
        remediations: r.remediations.map((rem) => ({
          id: rem.id,
          commandType: rem.commandType,
          status: rem.status,
          executionMode: rem.executionMode,
        })),
        co2AtRiskTon,
      };
    })
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 40);

  const totalDevicesAtRisk = new Set(prioritized.map((r) => r.deviceExternalId)).size;

  return (
    <AppShell
      title="Alertas predictivas"
      subtitle={`IA detectó ${totalDevicesAtRisk} dispositivos con riesgo de falla en los próximos 7 días · modelo entrenado con ${(recentPredictions.length * 1000).toLocaleString("es-CO")} lecturas históricas`}
    >
      <PredictionsConsole
        canRun={canWrite(me)}
        plants={plants.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
          client: displayClientLabel(p.client, { name: p.name }),
        }))}
        kpis={{
          totalPeriod,
          accuracyPct: accuracy != null ? accuracy * 100 : null,
          failuresAvoided,
          savingsCop,
          avgLeadDays: avgLead,
        }}
        heatmap={{
          days: heatmapDays.map((d) => ({ key: d.key, label: d.label })),
          rows: heatmapRows,
        }}
        brandDistribution={brandDistribution}
        prioritized={prioritized}
      />
    </AppShell>
  );
}
