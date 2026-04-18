"use client";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  Clock,
  Download,
  FileText,
  Filter,
  Printer,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { SectionCard } from "@/components/sunhub/section-card";
import { StatusBadge } from "@/components/sunhub/status-badge";
import { cn } from "@/lib/cn";

type Plant = { id: string; label: string; client: string };

type ReportItem = {
  id: string;
  plantName: string;
  plantCode: string;
  clientName: string;
  periodLabel: string;
  status: string;
  compliancePct: number | null;
  generatedAt: string;
};

type Metrics = {
  periodLabel: string;
  energyKwh: number;
  targetEnergyKwh: number;
  uptimePct: number;
  targetUptimePct: number;
  prPct: number;
  targetPrPct: number;
  co2Ton: number;
  savingsCop: number;
  targetSavingsCop: number;
  compliancePct: number;
  penaltyExposureCop: number;
};

type Result = {
  metrics: Metrics;
  narrative: string;
  plant: { name: string; code: string; client: string };
};

type Kpis = {
  reportsThisMonth: number;
  hoursSaved: number;
  nextScheduled: string;
  deliveryPct: number;
};

type Props = {
  plants: Plant[];
  reports: ReportItem[];
  kpis: Kpis;
};

const FILTERS = ["Cliente", "Marca", "Tipo", "Estado"] as const;

const SCHEDULED = [
  { id: "s1", title: "Mensual ejecutivo · Grupo Éxito", cadence: "Cada mes · día 1", next: "Mañana 07:00" },
  { id: "s2", title: "Semanal operativo · Bavaria", cadence: "Cada lunes", next: "Lunes 06:30" },
  { id: "s3", title: "Quincenal · Postobón", cadence: "Cada 15 días", next: "En 6 días" },
  { id: "s4", title: "Trimestral · Crepes & Waffles", cadence: "Cada trimestre", next: "En 14 días" },
];

function mapReportStatus(status: string): string {
  if (status === "sent") return "online";
  if (status === "generating") return "warning";
  if (status === "draft") return "unknown";
  return "unknown";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export function ReportsConsole({ plants, reports, kpis }: Props) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const filteredReports = useMemo(() => {
    if (!query.trim()) return reports;
    const q = query.toLowerCase();
    return reports.filter(
      (r) =>
        r.plantName.toLowerCase().includes(q) ||
        r.clientName.toLowerCase().includes(q) ||
        r.plantCode.toLowerCase().includes(q),
    );
  }, [reports, query]);

  async function generate() {
    if (!plantId) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setResult(json);
      setElapsed(Math.round(performance.now() - t0));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleFilter(f: string) {
    setActiveFilters((xs) => (xs.includes(f) ? xs.filter((x) => x !== f) : [...xs, f]));
  }

  return (
    <div className="space-y-6">
      {/* === KPIs === */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Generados este mes"
          value={kpis.reportsThisMonth}
          unit="reportes"
          tone="primary"
          icon={<FileText className="h-4 w-4" />}
          hint="Automatizados con MiniMax + datos reales"
        />
        <KpiCard
          label="Horas ahorradas"
          value={kpis.hoursSaved.toFixed(0)}
          unit="h / mes"
          tone="info"
          icon={<TrendingUp className="h-4 w-4" />}
          hint="vs. 40 min/planta manual"
        />
        <KpiCard
          label="Próximo envío"
          value={kpis.nextScheduled}
          tone="warning"
          icon={<CalendarClock className="h-4 w-4" />}
          hint="Ejecutivo Grupo Éxito"
        />
        <KpiCard
          label="Tasa de entrega"
          value={kpis.deliveryPct.toFixed(1)}
          unit="%"
          tone="violet"
          icon={<Send className="h-4 w-4" />}
          hint="Estado = sent / total"
        />
      </div>

      {/* === Filtros + buscador === */}
      <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <span className="inline-flex items-center gap-1.5 px-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
          <Filter className="h-3.5 w-3.5" /> Filtros
        </span>
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => toggleFilter(f)}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition",
              activeFilters.includes(f)
                ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300",
            )}
          >
            {f}
          </button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por planta, cliente o código…"
          className="ml-auto w-64 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100"
        />
      </div>

      {/* === Columnas principales === */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        {/* Izquierda: historial + generar */}
        <div className="space-y-4">
          <SectionCard
            title="Reportes recientes"
            subtitle={`${filteredReports.length} reportes · ordenados por fecha`}
            actions={
              <div className="flex items-center gap-2">
                <select
                  value={plantId}
                  onChange={(e) => setPlantId(e.target.value)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs focus:border-emerald-500 focus:outline-none"
                >
                  {plants.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label}
                    </option>
                  ))}
                </select>
                <button
                  onClick={() => void generate()}
                  disabled={busy || !plantId}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  {busy ? "Generando…" : "Generar reporte"}
                </button>
              </div>
            }
            bodyClassName="space-y-2"
          >
            {elapsed != null ? (
              <p className="text-xs text-emerald-700">Generado en {(elapsed / 1000).toFixed(1)}s</p>
            ) : null}
            {error ? <p className="text-xs text-red-600">{error}</p> : null}

            {filteredReports.length === 0 ? (
              <p className="py-10 text-center text-sm text-slate-500">
                Aún no hay reportes que coincidan. Genera uno desde el botón superior.
              </p>
            ) : (
              filteredReports.map((r) => (
                <div
                  key={r.id}
                  className="flex items-center gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-emerald-200 hover:bg-emerald-50/30"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                    <FileText className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-medium text-slate-900">{r.plantName}</span>
                      {r.plantCode ? (
                        <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                          {r.plantCode}
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2 text-[11px] text-slate-500">
                      <span>{r.clientName}</span>
                      <span>·</span>
                      <span>{r.periodLabel}</span>
                      <span>·</span>
                      <span>{formatDate(r.generatedAt)}</span>
                      {r.compliancePct != null ? (
                        <>
                          <span>·</span>
                          <span
                            className={cn(
                              "font-medium",
                              r.compliancePct >= 95 ? "text-emerald-700" : "text-red-600",
                            )}
                          >
                            {r.compliancePct.toFixed(1)}% cumplimiento
                          </span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <StatusBadge status={mapReportStatus(r.status)} />
                  <button
                    type="button"
                    className="rounded-md p-1.5 text-slate-400 hover:bg-emerald-50 hover:text-emerald-700"
                    aria-label="Descargar PDF"
                  >
                    <Download className="h-4 w-4" />
                  </button>
                </div>
              ))
            )}
          </SectionCard>

          {result ? (
            <SectionCard
              title={`Reporte · ${result.plant.name}`}
              subtitle={`${result.plant.client} · ${result.plant.code} · ${result.metrics.periodLabel}`}
              actions={
                <button
                  onClick={() => window.print()}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50 print:hidden"
                >
                  <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
                </button>
              }
            >
              <div className="grid grid-cols-2 gap-2 text-xs md:grid-cols-3">
                <Metric label="Energía" value={`${result.metrics.energyKwh.toFixed(0)} kWh`} target={`${result.metrics.targetEnergyKwh.toFixed(0)} kWh`} />
                <Metric label="Uptime" value={`${result.metrics.uptimePct.toFixed(1)}%`} target={`${result.metrics.targetUptimePct.toFixed(0)}%`} />
                <Metric label="PR" value={`${result.metrics.prPct.toFixed(1)}%`} target={`${result.metrics.targetPrPct.toFixed(0)}%`} />
                <Metric label="CO₂ evitado" value={`${result.metrics.co2Ton.toFixed(2)} ton`} />
                <Metric label="Ahorro" value={`$${result.metrics.savingsCop.toLocaleString("es-CO")}`} target={`$${result.metrics.targetSavingsCop.toLocaleString("es-CO")}`} />
                <Metric
                  label="Cumplimiento"
                  value={`${result.metrics.compliancePct.toFixed(1)}%`}
                  tone={result.metrics.compliancePct >= 95 ? "good" : "bad"}
                />
              </div>

              {result.metrics.penaltyExposureCop > 0 ? (
                <div className="mt-3 rounded-md bg-red-50 p-2.5 text-xs text-red-800">
                  Exposición a penalización: ${result.metrics.penaltyExposureCop.toLocaleString("es-CO")} COP
                </div>
              ) : null}

              <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-violet-700">
                  <Sparkles className="h-3 w-3" /> Resumen ejecutivo · MiniMax
                </div>
                <div className="whitespace-pre-wrap text-sm text-slate-800">{result.narrative}</div>
              </div>
            </SectionCard>
          ) : null}
        </div>

        {/* Derecha: programados */}
        <aside className="space-y-4">
          <SectionCard
            title="Programados"
            subtitle="Entregas automáticas recurrentes"
            actions={
              <button className="text-[11px] font-medium text-emerald-700 hover:underline">
                + Programar
              </button>
            }
            bodyClassName="space-y-2"
          >
            {SCHEDULED.map((s) => (
              <div
                key={s.id}
                className="rounded-xl border border-slate-100 bg-white p-3 transition hover:border-emerald-200"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-slate-900">{s.title}</div>
                    <div className="mt-0.5 text-[11px] text-slate-500">{s.cadence}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-medium text-amber-700">
                    <Clock className="h-3 w-3" />
                    {s.next}
                  </span>
                </div>
              </div>
            ))}
          </SectionCard>

          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-sm">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-100">
              Impacto del mes
            </div>
            <div className="mt-2 font-heading text-2xl font-bold">
              {kpis.hoursSaved.toFixed(0)} horas recuperadas
            </div>
            <p className="mt-1 text-xs text-emerald-50/90">
              Reportes automáticos = equipo enfocado en operación, no en PDFs.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Metric({
  label,
  value,
  target,
  tone,
}: {
  label: string;
  value: string;
  target?: string;
  tone?: "good" | "bad";
}) {
  return (
    <div className="rounded-md bg-slate-50 p-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div
        className={cn(
          "font-heading text-sm font-semibold",
          tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900",
        )}
      >
        {value}
      </div>
      {target ? <div className="text-[10px] text-slate-400">meta {target}</div> : null}
    </div>
  );
}
