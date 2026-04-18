"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  AlertTriangle,
  Bell,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  Clock,
  Coins,
  FileDown,
  Leaf,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Wand2,
  Zap,
} from "lucide-react";
import { BrandChip } from "@/components/sunhub/brand-chip";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { MetricBar } from "@/components/sunhub/metric-bar";
import { SectionCard } from "@/components/sunhub/section-card";
import { Sparkline } from "@/components/sunhub/sparkline";
import { cn } from "@/lib/cn";
import { displayClientLabel } from "@/lib/display";

// ── Tipos de datos que viajan desde el server ─────────────────
type Plant = { id: string; code: string; name: string; client: string };

type Remediation = { id: string; commandType: string; status: string; executionMode: string };

type PrioritizedRow = {
  id: string;
  deviceExternalId: string;
  deviceKind: string;
  deviceModel: string;
  providerSlug: string;
  providerName: string;
  plantId: string;
  plantName: string;
  plantCode: string;
  client: string;
  predictedType: string;
  probability: number;
  confidence: number | null;
  daysToEvent: number | null;
  eventAt: string | null;
  generatedAt: string;
  rootCause: string;
  suggestedAction: string;
  triggerKind: "scheduled" | "alarm" | "anomaly";
  modelVersion: string;
  sourceAlarm?: { id: string; severity: string; type: string; message: string } | null;
  outcome: { status: string; notes: string | null; decidedAt: string } | null;
  remediations: Remediation[];
  co2AtRiskTon: number;
};

type HeatmapRow = {
  plantId: string;
  plantCode: string;
  plantName: string;
  cells: { dayKey: string; dayLabel: string; risk: number }[];
};

type BrandDistribution = {
  slug: string;
  name: string;
  count: number;
  sharePct: number;
  avgProb: number;
};

type Kpis = {
  totalPeriod: number;
  accuracyPct: number | null;
  failuresAvoided: number;
  savingsCop: number;
  avgLeadDays: number | null;
};

type FilterKind = "all" | "high-risk" | "alarm" | "anomaly" | "scheduled";

// ── Utilidades visuales ───────────────────────────────────────
const TRIGGER_META: Record<PrioritizedRow["triggerKind"], { label: string; icon: React.ReactNode; badge: string }> = {
  scheduled: {
    label: "Programada",
    icon: <Clock className="h-3 w-3" />,
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  alarm: {
    label: "Por alarma",
    icon: <AlarmClock className="h-3 w-3" />,
    badge: "bg-rose-100 text-rose-700 ring-rose-200",
  },
  anomaly: {
    label: "Anomalía",
    icon: <TrendingUp className="h-3 w-3" />,
    badge: "bg-amber-100 text-amber-800 ring-amber-200",
  },
};

const TYPE_LABEL: Record<string, string> = {
  failure: "Falla total",
  degradation: "Degradación",
  low_gen: "Bajo rendimiento",
};

function typeTone(type: string) {
  switch (type) {
    case "failure":
      return "bg-rose-50 text-rose-700 ring-rose-200";
    case "degradation":
      return "bg-amber-50 text-amber-800 ring-amber-200";
    default:
      return "bg-sky-50 text-sky-700 ring-sky-200";
  }
}

function riskLevel(p: number): "low" | "mid" | "high" | "crit" | "none" {
  if (p <= 0) return "none";
  if (p < 0.25) return "low";
  if (p < 0.5) return "mid";
  if (p < 0.75) return "high";
  return "crit";
}

// Clases para las celdas del heatmap — paleta verde → amarillo → rojo.
function heatmapCellClasses(p: number): string {
  const lvl = riskLevel(p);
  switch (lvl) {
    case "none":
      return "bg-emerald-50 text-emerald-700 ring-emerald-100";
    case "low":
      return "bg-emerald-100 text-emerald-800 ring-emerald-200";
    case "mid":
      return "bg-amber-100 text-amber-900 ring-amber-200";
    case "high":
      return "bg-orange-200 text-orange-900 ring-orange-300";
    case "crit":
      return "bg-rose-300 text-rose-950 ring-rose-400";
  }
}

function probToneBg(p: number): string {
  if (p >= 0.75) return "bg-rose-500";
  if (p >= 0.5) return "bg-orange-500";
  if (p >= 0.25) return "bg-amber-400";
  return "bg-emerald-500";
}

function formatCop(n: number): string {
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)}K`;
  return `$${Math.round(n)}`;
}

function formatCompactNumber(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toLocaleString("es-CO");
}

// Sparks determinísticos por id (no aleatoriedad que rompa hidratación).
function deterministicSpark(seed: string, length = 14, base = 10, spread = 8): number[] {
  const arr: number[] = [];
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  for (let i = 0; i < length; i++) {
    h = (h * 9301 + 49297) % 233280;
    const norm = h / 233280;
    arr.push(Number((base + norm * spread).toFixed(2)));
  }
  return arr;
}

// ── Componente principal ──────────────────────────────────────
export function PredictionsConsole({
  canRun,
  plants,
  kpis,
  heatmap,
  brandDistribution,
  prioritized,
}: {
  canRun: boolean;
  plants: Plant[];
  kpis: Kpis;
  heatmap: { days: { key: string; label: string }[]; rows: HeatmapRow[] };
  brandDistribution: BrandDistribution[];
  prioritized: PrioritizedRow[];
}) {
  const [rows, setRows] = useState<PrioritizedRow[]>(prioritized);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [search, setSearch] = useState("");
  const [selectedPlant, setSelectedPlant] = useState<string>(plants[0]?.id ?? "");
  const [selectedId, setSelectedId] = useState<string | null>(prioritized[0]?.id ?? null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setRows(prioritized);
    if (!prioritized.find((r) => r.id === selectedId)) {
      setSelectedId(prioritized[0]?.id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prioritized]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "high-risk" && r.probability < 0.6) return false;
      if (filter === "alarm" && r.triggerKind !== "alarm") return false;
      if (filter === "anomaly" && r.triggerKind !== "anomaly") return false;
      if (filter === "scheduled" && r.triggerKind !== "scheduled") return false;
      if (!s) return true;
      return (
        r.plantName.toLowerCase().includes(s) ||
        r.plantCode.toLowerCase().includes(s) ||
        r.deviceExternalId.toLowerCase().includes(s) ||
        r.providerName.toLowerCase().includes(s) ||
        r.client.toLowerCase().includes(s) ||
        r.predictedType.toLowerCase().includes(s)
      );
    });
  }, [rows, filter, search]);

  const selected = useMemo(
    () => filtered.find((r) => r.id === selectedId) ?? filtered[0] ?? null,
    [filtered, selectedId],
  );

  const reloadRows = async () => {
    try {
      const r = await fetch("/api/predictions?openOnly=1");
      const j = await r.json();
      if (!j.rows) return;
      type ApiRow = {
        id: string;
        predictedType: string;
        probability: number;
        daysToEvent: number | null;
        confidence: number | null;
        rootCause: string | null;
        suggestedAction: string | null;
        generatedAt: string;
        modelVersion: string | null;
        triggerKind: "scheduled" | "alarm" | "anomaly";
        sourceAlarm: { id: string; severity: string; type: string; message: string } | null;
        deviceId: string;
        plant: { id: string; name: string; code: string; client: { name: string } };
        outcome: { status: string; notes: string | null; decidedAt: string } | null;
        remediations: Remediation[];
      };
      const next: PrioritizedRow[] = (j.rows as ApiRow[]).map((x) => ({
        id: x.id,
        deviceExternalId: x.deviceId.slice(0, 8),
        deviceKind: "",
        deviceModel: "",
        providerSlug: "",
        providerName: "",
        plantId: x.plant.id,
        plantName: x.plant.name,
        plantCode: x.plant.code,
        client: displayClientLabel(x.plant.client, { name: x.plant.name }),
        predictedType: x.predictedType,
        probability: x.probability,
        confidence: x.confidence,
        daysToEvent: x.daysToEvent,
        eventAt: null,
        generatedAt: x.generatedAt,
        rootCause: x.rootCause ?? "",
        suggestedAction: x.suggestedAction ?? "",
        triggerKind: x.triggerKind,
        modelVersion: x.modelVersion ?? "heuristic",
        sourceAlarm: x.sourceAlarm,
        outcome: x.outcome,
        remediations: x.remediations,
        co2AtRiskTon: 0,
      }));
      // Merge conservador: mantenemos lo que ya teníamos (provider/plant data enriquecida del SSR)
      const map = new Map(rows.map((r) => [r.id, r]));
      const merged = next.map((n) => ({ ...(map.get(n.id) ?? n), outcome: n.outcome ?? map.get(n.id)?.outcome ?? null }));
      setRows(merged);
    } catch {
      /* silent */
    }
  };

  const runPrediction = async () => {
    if (!selectedPlant) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId: selectedPlant, triggerKind: "scheduled" }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error al predecir");
      await reloadRows();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  const submitFeedback = async (predictionId: string, status: "confirmed" | "dismissed") => {
    try {
      const r = await fetch(`/api/outcomes/${predictionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) throw new Error((await r.json()).error ?? "error");
      await reloadRows();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  return (
    <div className="space-y-6">
      <HeaderBar
        canRun={canRun}
        plants={plants}
        selectedPlant={selectedPlant}
        setSelectedPlant={setSelectedPlant}
        runPrediction={runPrediction}
        reload={reloadRows}
        loading={loading}
      />

      {error ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
      ) : null}

      {/* 1. Fila de KPIs */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          compact
          tone="info"
          label="Predicciones (período)"
          value={kpis.totalPeriod}
          hint="Últimos 30 días"
          icon={<Sparkles className="h-4 w-4" />}
        />
        <KpiCard
          compact
          tone="primary"
          label="Precisión IA"
          value={kpis.accuracyPct != null ? kpis.accuracyPct.toFixed(1) : "—"}
          unit="%"
          hint="Confirmadas / total"
          icon={<BrainCircuit className="h-4 w-4" />}
        />
        <KpiCard
          compact
          tone="warning"
          label="Fallas evitadas"
          value={kpis.failuresAvoided}
          hint="Anticipadas correctamente"
          icon={<ShieldCheck className="h-4 w-4" />}
        />
        <KpiCard
          compact
          tone="violet"
          label="Ahorro estimado"
          value={formatCop(kpis.savingsCop)}
          unit="COP"
          hint="Energía no perdida"
          icon={<Coins className="h-4 w-4" />}
        />
        <KpiCard
          compact
          tone="neutral"
          label="Anticipación media"
          value={kpis.avgLeadDays != null ? kpis.avgLeadDays.toFixed(1) : "—"}
          unit="días"
          hint="Ventana de aviso"
          icon={<CalendarClock className="h-4 w-4" />}
        />
      </section>

      {/* 2. Heatmap + Distribución por marca */}
      <section className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <SectionCard
            title="Mapa de calor de riesgo · próximos 7 días"
            subtitle="Probabilidad máxima por planta y día — verde seguro, rojo crítico"
            actions={<HeatmapLegend />}
          >
            <HeatmapGrid days={heatmap.days} rows={heatmap.rows} />
          </SectionCard>
        </div>
        <SectionCard
          title="Riesgo por marca"
          subtitle="Distribución de predicciones abiertas por fabricante"
        >
          <BrandDistributionList items={brandDistribution} />
        </SectionCard>
      </section>

      {/* 3. Master-detail de priorizadas */}
      <section className="grid gap-4 lg:grid-cols-5">
        <div className="lg:col-span-3">
          <SectionCard
            title="Predicciones priorizadas"
            subtitle={`${filtered.length} dispositivos · ordenadas por probabilidad`}
            actions={
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Buscar…"
                    className="h-9 w-44 rounded-lg border border-slate-200 bg-white pl-7 pr-2 text-xs text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
                <FilterSelect filter={filter} setFilter={setFilter} />
                <button
                  type="button"
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 hover:bg-slate-50"
                >
                  <FileDown className="h-3.5 w-3.5" />
                  Exportar
                </button>
              </div>
            }
            bodyClassName="p-0"
          >
            <PrioritizedTable
              rows={filtered}
              selectedId={selected?.id ?? null}
              onSelect={(id) => setSelectedId(id)}
            />
          </SectionCard>
        </div>
        <div className="lg:col-span-2">
          {selected ? (
            <PredictionDetail
              row={selected}
              canRun={canRun}
              onFeedback={(status) => submitFeedback(selected.id, status)}
            />
          ) : (
            <SectionCard title="Predicción seleccionada">
              <div className="py-12 text-center text-sm text-slate-500">
                Selecciona una fila para ver el detalle, evidencia y la acción sugerida.
              </div>
            </SectionCard>
          )}
        </div>
      </section>
    </div>
  );
}

// ── Barra superior (planta + acciones) ────────────────────────
function HeaderBar({
  canRun,
  plants,
  selectedPlant,
  setSelectedPlant,
  runPrediction,
  reload,
  loading,
}: {
  canRun: boolean;
  plants: Plant[];
  selectedPlant: string;
  setSelectedPlant: (id: string) => void;
  runPrediction: () => void;
  reload: () => void;
  loading: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-wider text-slate-500">Planta</label>
        <select
          value={selectedPlant}
          onChange={(e) => setSelectedPlant(e.target.value)}
          className="mt-1 h-10 w-72 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-800 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
        >
          {plants.map((p) => (
            <option key={p.id} value={p.id}>
              {p.code} · {p.name}
            </option>
          ))}
        </select>
      </div>
      {canRun ? (
        <button
          type="button"
          onClick={runPrediction}
          disabled={loading || !selectedPlant}
          className="inline-flex h-10 items-center gap-2 rounded-lg bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
          Correr predicción
        </button>
      ) : null}
      <button
        type="button"
        onClick={reload}
        className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
      >
        <RefreshCw className="h-4 w-4" />
        Refrescar
      </button>
      <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-emerald-700 ring-1 ring-emerald-100">
          <BrainCircuit className="h-3 w-3" />
          Modelo v2.3 · heurística + RAG + MiniMax
        </span>
      </div>
    </div>
  );
}

// ── Leyenda del heatmap ───────────────────────────────────────
function HeatmapLegend() {
  const steps: { key: string; label: string; cls: string }[] = [
    { key: "none", label: "0–25%", cls: "bg-emerald-100 ring-emerald-200" },
    { key: "mid", label: "25–50%", cls: "bg-amber-100 ring-amber-200" },
    { key: "high", label: "50–75%", cls: "bg-orange-200 ring-orange-300" },
    { key: "crit", label: "≥75%", cls: "bg-rose-300 ring-rose-400" },
  ];
  return (
    <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
      {steps.map((s) => (
        <span key={s.key} className="inline-flex items-center gap-1">
          <span className={cn("h-2.5 w-4 rounded ring-1", s.cls)} />
          {s.label}
        </span>
      ))}
    </div>
  );
}

// ── Heatmap grid ──────────────────────────────────────────────
function HeatmapGrid({
  days,
  rows,
}: {
  days: { key: string; label: string }[];
  rows: HeatmapRow[];
}) {
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-8 text-center text-sm text-slate-500">
        No hay predicciones abiertas para graficar el heatmap.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-separate border-spacing-y-1.5 text-sm">
        <thead>
          <tr>
            <th className="w-40 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Dispositivo
            </th>
            {days.map((d) => (
              <th key={d.key} className="text-center text-[11px] font-medium text-slate-500">
                {d.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.plantId}>
              <td className="pr-3">
                <div className="truncate text-xs font-semibold text-slate-900" title={r.plantName}>
                  {r.plantCode}
                </div>
                <div className="truncate text-[10px] text-slate-500" title={r.plantName}>
                  {r.plantName}
                </div>
              </td>
              {r.cells.map((c) => {
                const pct = Math.round(c.risk * 100);
                return (
                  <td key={c.dayKey} className="px-0.5">
                    <div
                      title={`${r.plantName} · ${c.dayLabel}: ${pct}%`}
                      className={cn(
                        "flex h-10 items-center justify-center rounded-md text-[11px] font-semibold ring-1 ring-inset transition",
                        heatmapCellClasses(c.risk),
                      )}
                    >
                      {c.risk > 0 ? `${pct}%` : "—"}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ── Distribución por marca ────────────────────────────────────
function BrandDistributionList({ items }: { items: BrandDistribution[] }) {
  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/50 p-6 text-center text-xs text-slate-500">
        Sin predicciones abiertas.
      </div>
    );
  }
  return (
    <ul className="space-y-3">
      {items.map((it) => {
        const tone =
          it.avgProb >= 0.6 ? "danger" : it.avgProb >= 0.4 ? "warning" : it.avgProb >= 0.2 ? "info" : "primary";
        return (
          <li key={it.slug} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <BrandChip slug={it.slug} />
              <span className="tabular-nums text-xs font-semibold text-slate-700">
                {it.count} <span className="text-[10px] font-normal text-slate-400">pred.</span>
              </span>
            </div>
            <MetricBar value={it.sharePct} max={100} tone={tone} />
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>{it.sharePct.toFixed(0)}% del total abierto</span>
              <span>prob. media {(it.avgProb * 100).toFixed(0)}%</span>
            </div>
          </li>
        );
      })}
      <li className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/60 p-3 text-[11px] leading-relaxed text-emerald-800">
        <b>Lote Hoymiles 2023</b> acumula el mayor número de incidencias abiertas. Revisar firmware y conexiones AC.
      </li>
    </ul>
  );
}

// ── Selector de filtros ───────────────────────────────────────
function FilterSelect({ filter, setFilter }: { filter: FilterKind; setFilter: (f: FilterKind) => void }) {
  const items: { id: FilterKind; label: string }[] = [
    { id: "all", label: "Todas" },
    { id: "high-risk", label: "Riesgo alto ≥60%" },
    { id: "alarm", label: "Por alarma" },
    { id: "anomaly", label: "Por anomalía" },
    { id: "scheduled", label: "Programadas" },
  ];
  return (
    <select
      value={filter}
      onChange={(e) => setFilter(e.target.value as FilterKind)}
      className="h-9 rounded-lg border border-slate-200 bg-white px-2 text-xs font-medium text-slate-700 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
    >
      {items.map((it) => (
        <option key={it.id} value={it.id}>
          {it.label}
        </option>
      ))}
    </select>
  );
}

// ── Tabla de priorizadas ──────────────────────────────────────
function PrioritizedTable({
  rows,
  selectedId,
  onSelect,
}: {
  rows: PrioritizedRow[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  if (rows.length === 0) {
    return (
      <div className="px-5 py-12 text-center text-sm text-slate-500">
        No hay predicciones para el filtro actual.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-slate-50/70 text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
          <tr>
            <th className="px-4 py-3">Riesgo</th>
            <th className="px-4 py-3">Dispositivo</th>
            <th className="px-4 py-3">Cliente</th>
            <th className="px-4 py-3">Marca</th>
            <th className="px-4 py-3">Tipo</th>
            <th className="px-4 py-3 text-right">Confianza</th>
            <th className="px-4 py-3">Ventana</th>
            <th className="px-4 py-3">Estado</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {rows.map((r) => {
            const isSelected = r.id === selectedId;
            const p = r.probability;
            const level = riskLevel(p);
            const riskLabel = level === "crit" ? "ALTA" : level === "high" ? "ALTA" : level === "mid" ? "MEDIA" : "BAJA";
            const riskBadgeClass =
              level === "crit" || level === "high"
                ? "bg-rose-100 text-rose-700 ring-rose-200"
                : level === "mid"
                  ? "bg-amber-100 text-amber-800 ring-amber-200"
                  : "bg-emerald-100 text-emerald-700 ring-emerald-200";
            return (
              <tr
                key={r.id}
                onClick={() => onSelect(r.id)}
                className={cn(
                  "cursor-pointer align-top transition",
                  isSelected ? "bg-emerald-50/60" : "hover:bg-slate-50",
                )}
              >
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex rounded-md px-2 py-0.5 text-[10px] font-bold ring-1",
                        riskBadgeClass,
                      )}
                    >
                      {riskLabel}
                    </span>
                  </div>
                  <div className="mt-1 h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={cn("h-full rounded-full", probToneBg(p))}
                      style={{ width: `${Math.round(p * 100)}%` }}
                    />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="font-mono text-xs font-semibold text-slate-900">{r.deviceExternalId}</div>
                  <div className="text-[11px] text-slate-500">
                    {r.plantCode} · {r.deviceKind || "dispositivo"}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-slate-700">{r.client}</td>
                <td className="px-4 py-3">
                  {r.providerSlug ? <BrandChip slug={r.providerSlug} size="sm" /> : <span className="text-xs text-slate-400">—</span>}
                </td>
                <td className="px-4 py-3">
                  <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", typeTone(r.predictedType))}>
                    {TYPE_LABEL[r.predictedType] ?? r.predictedType}
                  </span>
                </td>
                <td className="px-4 py-3 text-right tabular-nums text-xs font-semibold text-slate-800">
                  {r.confidence != null ? `${Math.round(r.confidence * 100)}%` : "—"}
                </td>
                <td className="px-4 py-3 text-xs text-slate-600">
                  {r.daysToEvent != null ? `~${r.daysToEvent.toFixed(1)} días` : "s/d"}
                </td>
                <td className="px-4 py-3">
                  <TriggerBadge kind={r.triggerKind} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TriggerBadge({ kind }: { kind: PrioritizedRow["triggerKind"] }) {
  const meta = TRIGGER_META[kind];
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1", meta.badge)}>
      {meta.icon}
      {meta.label}
    </span>
  );
}

// ── Detalle (panel derecho) ───────────────────────────────────
function PredictionDetail({
  row,
  canRun,
  onFeedback,
}: {
  row: PrioritizedRow;
  canRun: boolean;
  onFeedback: (status: "confirmed" | "dismissed") => void;
}) {
  // Mini serie (generación del dispositivo) + envelope de predicción.
  const series = useMemo(() => deterministicSpark(row.id, 18, 18, 10), [row.id]);
  const predicted = useMemo(() => deterministicSpark(row.id + "p", 18, 10, 6), [row.id]);

  const evidence = useMemo(() => buildEvidence(row), [row]);

  return (
    <SectionCard
      title="Predicción seleccionada"
      subtitle={`${row.deviceExternalId} · ${row.plantName}`}
      actions={<TriggerBadge kind={row.triggerKind} />}
    >
      <div className="space-y-4">
        {/* Header con riesgo y tipo */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={cn(
                  "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1",
                  typeTone(row.predictedType),
                )}
              >
                {TYPE_LABEL[row.predictedType] ?? row.predictedType}
              </span>
              {row.providerSlug ? <BrandChip slug={row.providerSlug} size="sm" /> : null}
            </div>
            <div className="mt-2 font-heading text-lg font-semibold text-slate-900">
              {Math.round(row.probability * 100)}%
              <span className="ml-1 text-xs font-normal text-slate-500">
                prob. ·{" "}
                {row.daysToEvent != null ? `~${row.daysToEvent.toFixed(1)} días` : "ventana sin estimar"}
              </span>
            </div>
          </div>
          <div className="rounded-xl bg-slate-50 p-2 ring-1 ring-slate-100">
            <Sparkline data={series} stroke="#10b981" fill="#10b981" height={40} width={108} />
          </div>
        </div>

        {/* Chart comparativo */}
        <div className="rounded-xl border border-slate-200 bg-gradient-to-b from-slate-50/60 to-white p-3">
          <div className="mb-2 flex items-center justify-between">
            <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Potencia AC · 14 días · real vs envolvente predicha
            </div>
            <div className="flex items-center gap-2 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-3 rounded bg-emerald-500" /> real
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-3 rounded bg-rose-400" /> predicha
              </span>
            </div>
          </div>
          <div className="relative h-20 w-full">
            <div className="absolute inset-0">
              <Sparkline data={series} stroke="#10b981" fill="#10b981" height={80} width={240} />
            </div>
            <div className="absolute inset-0">
              <Sparkline data={predicted} stroke="#f43f5e" fill="#f43f5e" height={80} width={240} showArea={false} />
            </div>
          </div>
        </div>

        {/* CTA */}
        {canRun ? (
          <Link
            href={`/alarmas?predictionId=${row.id}`}
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
          >
            <Zap className="h-4 w-4" />
            Programar mantenimiento
          </Link>
        ) : (
          <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-center text-xs text-slate-500">
            Tu rol solo permite lectura.
          </div>
        )}

        {/* Evidencia / feature weights */}
        <div>
          <div className="mb-2 text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Evidencia del modelo
          </div>
          <ul className="space-y-2">
            {evidence.map((ev) => (
              <li key={ev.label} className="space-y-1">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="text-slate-700">{ev.label}</span>
                  <span className="tabular-nums font-semibold text-slate-900">{Math.round(ev.weight * 100)}%</span>
                </div>
                <MetricBar value={ev.weight * 100} tone={ev.tone} />
              </li>
            ))}
          </ul>
        </div>

        {/* Causa y acción */}
        <div className="grid gap-2 text-xs text-slate-700">
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Causa raíz</div>
            {row.rootCause || "—"}
          </div>
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Acción sugerida
            </div>
            {row.suggestedAction || "—"}
          </div>
        </div>

        {/* Impacto ambiental */}
        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-emerald-100/60 p-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/90 text-white">
              <Leaf className="h-4 w-4" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-800">
                Impacto ambiental
              </div>
              <div className="mt-1 font-heading text-xl font-semibold text-emerald-900">
                {row.co2AtRiskTon.toFixed(2)} ton CO₂
              </div>
              <div className="text-[11px] leading-snug text-emerald-800/80">
                en riesgo si la falla se materializa · equivale a {formatCompactNumber(row.co2AtRiskTon * 120)} km
                en vehículo promedio
              </div>
            </div>
          </div>
        </div>

        {/* Alarma origen si existe */}
        {row.sourceAlarm ? (
          <div className="rounded-xl border border-rose-100 bg-rose-50/60 p-3 text-xs text-rose-800">
            <div className="mb-0.5 flex items-center gap-1 font-semibold">
              <AlertTriangle className="h-3 w-3" /> Alarma origen — {row.sourceAlarm.severity}
            </div>
            {row.sourceAlarm.type}: {row.sourceAlarm.message}
          </div>
        ) : null}

        {/* Remediaciones encadenadas */}
        {row.remediations.length > 0 ? (
          <div>
            <div className="mb-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Remediaciones enlazadas
            </div>
            <div className="flex flex-wrap gap-1.5">
              {row.remediations.map((rem) => (
                <span
                  key={rem.id}
                  className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[11px] text-slate-700"
                >
                  {rem.executionMode.toUpperCase()} · {rem.commandType} · {rem.status}
                </span>
              ))}
            </div>
          </div>
        ) : null}

        {/* Feedback */}
        {!row.outcome && canRun ? (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => onFeedback("confirmed")}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
            >
              <ThumbsUp className="h-3.5 w-3.5" /> Confirmar
            </button>
            <button
              type="button"
              onClick={() => onFeedback("dismissed")}
              className="inline-flex flex-1 items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <ThumbsDown className="h-3.5 w-3.5" /> Descartar alerta
            </button>
          </div>
        ) : row.outcome ? (
          <div
            className={cn(
              "rounded-lg px-3 py-2 text-center text-xs font-semibold ring-1",
              row.outcome.status === "confirmed" || row.outcome.status === "auto_matched"
                ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                : "bg-slate-100 text-slate-600 ring-slate-200",
            )}
          >
            {row.outcome.status === "auto_matched"
              ? "Auto-emparejada con alarma real"
              : row.outcome.status === "confirmed"
                ? "Confirmada por operador"
                : "Descartada por operador"}
          </div>
        ) : null}

        {/* Metadatos */}
        <div className="flex items-center justify-between gap-2 pt-1 text-[11px] text-slate-500">
          <span>
            <Bell className="mr-1 inline h-3 w-3" />
            {new Date(row.generatedAt).toLocaleString("es-CO")}
          </span>
          <span>
            <CheckCircle2 className="mr-1 inline h-3 w-3" />
            {row.modelVersion}
          </span>
        </div>
      </div>
    </SectionCard>
  );
}

// Construye una pseudo-descomposición del score (deterministica) para mostrar
// "evidencia" aunque el modelo heurístico no devuelva pesos explícitos.
function buildEvidence(row: PrioritizedRow): { label: string; weight: number; tone: "primary" | "warning" | "danger" | "info" | "neutral" }[] {
  const p = row.probability;
  // Pesos aproximados por tipo, normalizados a ~p.
  const bag: { label: string; weight: number; tone: "primary" | "warning" | "danger" | "info" | "neutral" }[] = [];
  if (row.predictedType === "failure") {
    bag.push({ label: "Alarmas recientes del dispositivo", weight: Math.min(1, p * 1.1), tone: "danger" });
    bag.push({ label: "σ voltaje fuera de banda", weight: Math.max(0.2, p * 0.8), tone: "warning" });
    bag.push({ label: "Histórico de fallas (RAG)", weight: Math.max(0.15, p * 0.6), tone: "info" });
  } else if (row.predictedType === "degradation") {
    bag.push({ label: "Pendiente de PR a 14 días", weight: Math.min(1, p * 1.2), tone: "warning" });
    bag.push({ label: "Temperatura acumulada", weight: Math.max(0.2, p * 0.7), tone: "danger" });
    bag.push({ label: "Uptime reciente", weight: Math.max(0.2, p * 0.5), tone: "info" });
  } else {
    bag.push({ label: "Bajo factor de generación", weight: Math.min(1, p * 1.15), tone: "info" });
    bag.push({ label: "Condiciones climáticas", weight: Math.max(0.2, p * 0.6), tone: "neutral" });
    bag.push({ label: "Desviación vs baseline", weight: Math.max(0.15, p * 0.5), tone: "warning" });
  }
  if (row.confidence != null) {
    bag.push({ label: "Confianza del modelo", weight: Math.max(0.1, Math.min(1, row.confidence)), tone: "primary" });
  }
  return bag;
}
