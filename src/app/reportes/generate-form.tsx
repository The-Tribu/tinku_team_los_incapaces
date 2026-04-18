"use client";
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  CalendarClock,
  Clock,
  Download,
  FileText,
  Filter,
  Mail,
  Play,
  Printer,
  Send,
  Sparkles,
  Trash2,
  TrendingUp,
  X,
} from "lucide-react";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { SectionCard } from "@/components/sunhub/section-card";
import { StatusBadge } from "@/components/sunhub/status-badge";
import { cn } from "@/lib/cn";
import { stripMarkdown } from "@/lib/strip-markdown";

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
  defaultEmail: string | null;
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
  reportId: string;
  metrics: Metrics;
  narrative: string;
  plant: { name: string; code: string; client: string };
  defaultEmail: string | null;
};

type Kpis = {
  reportsThisMonth: number;
  hoursSaved: number;
  nextScheduled: string;
  deliveryPct: number;
};

type ScheduleItem = {
  id: string;
  title: string;
  cadence: string;
  cadenceLabel: string;
  dayOfMonth: number | null;
  dayOfWeek: number | null;
  hour: number;
  minute: number;
  recipientEmail: string | null;
  active: boolean;
  nextRunAt: string | null;
  nextRunLabel: string;
  lastStatus: string | null;
  lastError: string | null;
  plantId: string | null;
  plantName: string | null;
  plantCode: string | null;
  clientName: string | null;
};

type Props = {
  plants: Plant[];
  reports: ReportItem[];
  schedules: ScheduleItem[];
  kpis: Kpis;
};

const FILTERS = ["Cliente", "Marca", "Tipo", "Estado"] as const;

function mapReportStatus(status: string): string {
  if (status === "sent") return "online";
  if (status === "generating") return "warning";
  if (status === "draft") return "unknown";
  return "unknown";
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", { day: "numeric", month: "short", year: "numeric" });
}

export function ReportsConsole({ plants, reports, schedules, kpis }: Props) {
  const router = useRouter();
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [activeFilters, setActiveFilters] = useState<string[]>([]);
  const [query, setQuery] = useState("");

  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [schedulePending, setSchedulePending] = useState<string | null>(null);
  const [emailPending, setEmailPending] = useState<string | null>(null);
  const [emailToast, setEmailToast] = useState<
    { kind: "ok" | "err"; msg: string } | null
  >(null);
  const [emailTarget, setEmailTarget] = useState<{
    reportId: string;
    defaultEmail: string;
    plantName: string;
  } | null>(null);

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
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function toggleFilter(f: string) {
    setActiveFilters((xs) => (xs.includes(f) ? xs.filter((x) => x !== f) : [...xs, f]));
  }

  async function runScheduleNow(id: string) {
    setSchedulePending(id);
    try {
      const res = await fetch(`/api/report-schedules/${id}/run`, { method: "POST" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      alert(`No se pudo ejecutar: ${(err as Error).message}`);
    } finally {
      setSchedulePending(null);
    }
  }

  function openEmailModal(
    reportId: string,
    defaultEmail: string | null,
    plantName: string,
  ) {
    setEmailTarget({
      reportId,
      defaultEmail: defaultEmail ?? "",
      plantName,
    });
  }

  async function confirmSendEmail(to: string) {
    if (!emailTarget) return;
    const { reportId } = emailTarget;
    setEmailTarget(null);
    setEmailPending(reportId);
    setEmailToast(null);
    try {
      const res = await fetch(`/api/reports/${reportId}/email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(to ? { to } : {}),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setEmailToast({ kind: "ok", msg: `Reporte enviado a ${json.to}` });
      router.refresh();
    } catch (err) {
      setEmailToast({ kind: "err", msg: `No se pudo enviar: ${(err as Error).message}` });
    } finally {
      setEmailPending(null);
      setTimeout(() => setEmailToast(null), 6000);
    }
  }

  async function deleteSchedule(id: string) {
    if (!confirm("¿Eliminar esta programación?")) return;
    setSchedulePending(id);
    try {
      const res = await fetch(`/api/report-schedules/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error ?? `HTTP ${res.status}`);
      }
      router.refresh();
    } catch (err) {
      alert(`No se pudo eliminar: ${(err as Error).message}`);
    } finally {
      setSchedulePending(null);
    }
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
          hint={schedules.filter((s) => s.active).length > 0
            ? `${schedules.filter((s) => s.active).length} programación(es) activa(s)`
            : "Sin programaciones"}
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
                    onClick={() => openEmailModal(r.id, r.defaultEmail, r.plantName)}
                    disabled={emailPending === r.id}
                    className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    aria-label="Enviar por correo"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {emailPending === r.id ? "Enviando…" : "Enviar"}
                  </button>
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
            {emailToast ? (
              <div
                className={cn(
                  "mt-2 rounded-md px-3 py-2 text-xs",
                  emailToast.kind === "ok"
                    ? "bg-emerald-50 text-emerald-800"
                    : "bg-red-50 text-red-700",
                )}
              >
                {emailToast.msg}
              </div>
            ) : null}
          </SectionCard>

          {result ? (
            <SectionCard
              title={`Reporte · ${result.plant.name}`}
              subtitle={`${result.plant.client} · ${result.plant.code} · ${result.metrics.periodLabel}`}
              actions={
                <div className="flex items-center gap-2 print:hidden">
                  <button
                    onClick={() =>
                      result &&
                      openEmailModal(result.reportId, result.defaultEmail, result.plant.name)
                    }
                    disabled={!result || emailPending === result.reportId}
                    className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    {emailPending === result?.reportId ? "Enviando…" : "Enviar al cliente"}
                  </button>
                  <button
                    onClick={() => window.print()}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-50"
                  >
                    <Printer className="h-3.5 w-3.5" /> Imprimir / PDF
                  </button>
                </div>
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
                <div className="whitespace-pre-wrap text-sm text-slate-800">
                  {stripMarkdown(result.narrative)}
                </div>
              </div>
            </SectionCard>
          ) : null}
        </div>

        {/* Derecha: programados */}
        <aside className="space-y-4">
          <SectionCard
            title="Programados"
            subtitle={
              schedules.length === 0
                ? "Sin programaciones"
                : `${schedules.length} programación(es) · cron cada minuto`
            }
            actions={
              <button
                onClick={() => setScheduleModalOpen(true)}
                className="text-[11px] font-medium text-emerald-700 hover:underline"
              >
                + Programar
              </button>
            }
            bodyClassName="space-y-2"
          >
            {schedules.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">
                Crea la primera programación para automatizar la entrega de reportes.
              </p>
            ) : (
              schedules.map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "rounded-xl border bg-white p-3 transition",
                    s.active
                      ? "border-slate-100 hover:border-emerald-200"
                      : "border-slate-100 bg-slate-50/50 opacity-70",
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">{s.title}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        {s.cadenceLabel}
                        {s.plantName ? ` · ${s.plantName}` : s.clientName ? ` · ${s.clientName}` : ""}
                      </div>
                      {s.recipientEmail ? (
                        <div className="mt-0.5 truncate text-[11px] text-slate-400">
                          → {s.recipientEmail}
                        </div>
                      ) : null}
                      {s.lastStatus === "failed" && s.lastError ? (
                        <div className="mt-1 truncate text-[11px] text-red-600">
                          ✗ {s.lastError}
                        </div>
                      ) : null}
                    </div>
                    <span
                      className={cn(
                        "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                        s.active
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-slate-200 bg-slate-100 text-slate-500",
                      )}
                    >
                      <Clock className="h-3 w-3" />
                      {s.active ? s.nextRunLabel : "Pausado"}
                    </span>
                  </div>
                  <div className="mt-2 flex items-center gap-1">
                    <button
                      onClick={() => void runScheduleNow(s.id)}
                      disabled={schedulePending === s.id}
                      className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-white px-2 py-1 text-[11px] font-medium text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                    >
                      <Play className="h-3 w-3" />
                      {schedulePending === s.id ? "Ejecutando…" : "Ejecutar ahora"}
                    </button>
                    <button
                      onClick={() => void deleteSchedule(s.id)}
                      disabled={schedulePending === s.id}
                      className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-600 hover:border-red-200 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
                      aria-label="Eliminar"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              ))
            )}
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

      {scheduleModalOpen ? (
        <ScheduleModal
          plants={plants}
          onClose={() => setScheduleModalOpen(false)}
          onCreated={() => {
            setScheduleModalOpen(false);
            router.refresh();
          }}
        />
      ) : null}

      {emailTarget ? (
        <EmailConfirmModal
          plantName={emailTarget.plantName}
          defaultEmail={emailTarget.defaultEmail}
          onClose={() => setEmailTarget(null)}
          onConfirm={(to) => void confirmSendEmail(to)}
        />
      ) : null}
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

const WEEKDAYS = [
  { value: 1, label: "Lunes" },
  { value: 2, label: "Martes" },
  { value: 3, label: "Miércoles" },
  { value: 4, label: "Jueves" },
  { value: 5, label: "Viernes" },
  { value: 6, label: "Sábado" },
  { value: 0, label: "Domingo" },
];

function ScheduleModal({
  plants,
  onClose,
  onCreated,
}: {
  plants: Plant[];
  onClose: () => void;
  onCreated: () => void;
}) {
  const [title, setTitle] = useState("");
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [cadence, setCadence] = useState<"monthly" | "weekly" | "biweekly" | "quarterly">("monthly");
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [dayOfWeek, setDayOfWeek] = useState(1);
  const [hour, setHour] = useState(7);
  const [minute, setMinute] = useState(0);
  const [recipientEmail, setRecipientEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function submit() {
    if (!title.trim() || !plantId) {
      setErr("Título y planta son obligatorios");
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await fetch("/api/report-schedules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          plantId,
          cadence,
          dayOfMonth: cadence === "monthly" || cadence === "quarterly" ? dayOfMonth : null,
          dayOfWeek: cadence === "weekly" || cadence === "biweekly" ? dayOfWeek : null,
          hour,
          minute,
          recipientEmail: recipientEmail.trim() || null,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
      onCreated();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h3 className="font-heading text-lg font-semibold text-slate-900">
              Nueva programación
            </h3>
            <p className="text-xs text-slate-500">Entrega automática recurrente de un reporte</p>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3">
          <Field label="Título">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mensual ejecutivo · Cliente X"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </Field>

          <Field label="Planta">
            <select
              value={plantId}
              onChange={(e) => setPlantId(e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              {plants.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Cadencia">
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as typeof cadence)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
            >
              <option value="monthly">Mensual</option>
              <option value="weekly">Semanal</option>
              <option value="biweekly">Quincenal</option>
              <option value="quarterly">Trimestral</option>
            </select>
          </Field>

          {cadence === "monthly" || cadence === "quarterly" ? (
            <Field label="Día del mes">
              <input
                type="number"
                min={1}
                max={28}
                value={dayOfMonth}
                onChange={(e) => setDayOfMonth(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </Field>
          ) : (
            <Field label="Día de la semana">
              <select
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                {WEEKDAYS.map((d) => (
                  <option key={d.value} value={d.value}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="Hora (Bogotá)">
              <input
                type="number"
                min={0}
                max={23}
                value={hour}
                onChange={(e) => setHour(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </Field>
            <Field label="Minuto">
              <input
                type="number"
                min={0}
                max={59}
                value={minute}
                onChange={(e) => setMinute(Number(e.target.value))}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              />
            </Field>
          </div>

          <Field label="Destinatario (opcional)">
            <input
              type="email"
              value={recipientEmail}
              onChange={(e) => setRecipientEmail(e.target.value)}
              placeholder="cliente@empresa.com"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            />
          </Field>

          {err ? <p className="text-xs text-red-600">{err}</p> : null}
        </div>

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={() => void submit()}
            disabled={submitting}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <CalendarClock className="h-3.5 w-3.5" />
            {submitting ? "Creando…" : "Crear programación"}
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}

function ModalPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmailConfirmModal({
  plantName,
  defaultEmail,
  onClose,
  onConfirm,
}: {
  plantName: string;
  defaultEmail: string;
  onClose: () => void;
  onConfirm: (to: string) => void;
}) {
  const [email, setEmail] = useState(defaultEmail);
  const [touched, setTouched] = useState(false);

  const trimmed = email.trim();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  const showError = touched && !valid;

  function submit() {
    if (!valid) {
      setTouched(true);
      return;
    }
    onConfirm(trimmed);
  }

  return (
    <ModalPortal>
      <div
        className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
        onClick={onClose}
      >
      <div
        className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <Mail className="h-5 w-5" />
            </span>
            <div>
              <h3 className="font-heading text-base font-semibold text-slate-900">
                Enviar reporte por correo
              </h3>
              <p className="text-xs text-slate-500">
                Reporte de <span className="font-medium text-slate-700">{plantName}</span>
              </p>
            </div>
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        </div>

        <Field label="Destinatario">
          <input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onBlur={() => setTouched(true)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
            placeholder="cliente@empresa.com"
            className={cn(
              "w-full rounded-lg border bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2",
              showError
                ? "border-red-300 focus:border-red-500 focus:ring-red-100"
                : "border-slate-200 focus:border-emerald-500 focus:ring-emerald-100",
            )}
          />
        </Field>

        {defaultEmail ? (
          <p className="mt-1.5 text-[11px] text-slate-500">
            Preferencia del cliente: <span className="font-mono">{defaultEmail}</span>
          </p>
        ) : (
          <p className="mt-1.5 text-[11px] text-amber-700">
            El cliente no tiene correo registrado. Ingresa uno para continuar.
          </p>
        )}

        {showError ? (
          <p className="mt-1.5 text-[11px] text-red-600">Ingresa un correo válido.</p>
        ) : null}

        <div className="mt-5 flex items-center justify-end gap-2">
          <button
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={!valid}
            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" />
            Enviar ahora
          </button>
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}
