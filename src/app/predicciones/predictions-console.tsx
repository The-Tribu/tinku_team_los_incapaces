"use client";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlarmClock,
  AlertTriangle,
  Bell,
  Brain,
  CheckCircle2,
  Clock,
  Loader2,
  Play,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  TrendingUp,
  Wand2,
} from "lucide-react";

type Plant = { id: string; code: string; name: string; client: string };
type Remediation = { id: string; commandType: string; status: string; executionMode: string };
type Row = {
  id: string;
  predictedType: string;
  probability: number;
  daysToEvent: number | null;
  confidence: number | null;
  rootCause: string;
  suggestedAction: string;
  generatedAt: string;
  modelVersion: string;
  triggerKind: "scheduled" | "alarm" | "anomaly";
  sourceAlarm?: { id: string; severity: string; type: string; message: string } | null;
  plantId: string;
  plantName: string;
  plantCode: string;
  client: string;
  outcome: { status: string; notes: string | null; decidedAt: string } | null;
  remediations: Remediation[];
};

type Stats = {
  total: number;
  confirmed: number;
  auto_matched: number;
  dismissed: number;
  accuracy: number | null;
  openPredictions: number;
};

type FilterKind = "all" | "open" | "scheduled" | "alarm" | "anomaly" | "high-risk";

const TRIGGER_META: Record<Row["triggerKind"], { label: string; icon: React.ReactNode; badge: string }> = {
  scheduled: {
    label: "Programada",
    icon: <Clock className="h-3 w-3" />,
    badge: "bg-slate-100 text-slate-700 ring-slate-200",
  },
  alarm: {
    label: "Disparada por alarma",
    icon: <AlarmClock className="h-3 w-3" />,
    badge: "bg-rose-100 text-rose-700 ring-rose-200",
  },
  anomaly: {
    label: "Anomalía (z-score)",
    icon: <TrendingUp className="h-3 w-3" />,
    badge: "bg-amber-100 text-amber-800 ring-amber-200",
  },
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

function probTone(p: number) {
  if (p >= 0.7) return "bg-rose-500";
  if (p >= 0.4) return "bg-amber-400";
  return "bg-sky-500";
}

export function PredictionsConsole({
  canRun,
  plants,
  initialRows,
}: {
  canRun: boolean;
  plants: Plant[];
  initialRows: Row[];
}) {
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<FilterKind>("all");
  const [search, setSearch] = useState("");
  const [selectedPlant, setSelectedPlant] = useState<string>(plants[0]?.id ?? "");
  const [showMethod, setShowMethod] = useState(false);

  const loadStats = async () => {
    try {
      const r = await fetch("/api/outcomes/stats");
      const j = await r.json();
      setStats(j);
    } catch {
      /* non-fatal */
    }
  };

  const loadRows = async () => {
    try {
      const r = await fetch("/api/predictions");
      const j = await r.json();
      if (j.rows) {
        setRows(
          j.rows.map((x: Row & { plant: { id: string; name: string; code: string; client: { name: string } } }) => ({
            ...x,
            plantId: x.plant?.id ?? x.plantId,
            plantName: x.plant?.name ?? x.plantName,
            plantCode: x.plant?.code ?? x.plantCode,
            client: x.plant?.client?.name ?? x.client,
          })),
        );
      }
    } catch {
      /* non-fatal */
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

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
      await Promise.all([loadRows(), loadStats()]);
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
      await Promise.all([loadRows(), loadStats()]);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "open" && r.outcome) return false;
      if (filter === "scheduled" && r.triggerKind !== "scheduled") return false;
      if (filter === "alarm" && r.triggerKind !== "alarm") return false;
      if (filter === "anomaly" && r.triggerKind !== "anomaly") return false;
      if (filter === "high-risk" && r.probability < 0.6) return false;
      if (!s) return true;
      return (
        r.plantName.toLowerCase().includes(s) ||
        r.plantCode.toLowerCase().includes(s) ||
        r.client.toLowerCase().includes(s) ||
        r.predictedType.toLowerCase().includes(s) ||
        r.rootCause.toLowerCase().includes(s)
      );
    });
  }, [rows, filter, search]);

  return (
    <div className="space-y-6">
      {/* Tiles de accuracy */}
      <div className="grid gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-sky-700">Predicciones abiertas</div>
            <Bell className="h-4 w-4 text-sky-700" />
          </div>
          <div className="mt-2 font-heading text-3xl font-bold text-slate-900">
            {stats?.openPredictions ?? rows.filter((r) => !r.outcome).length}
          </div>
          <div className="text-xs text-slate-500">Últimos 30 días sin outcome</div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-emerald-700">Accuracy</div>
            <CheckCircle2 className="h-4 w-4 text-emerald-700" />
          </div>
          <div className="mt-2 font-heading text-3xl font-bold text-slate-900">
            {stats?.accuracy != null ? `${(stats.accuracy * 100).toFixed(0)}%` : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {stats ? `${stats.confirmed + stats.auto_matched}/${stats.total} confirmadas` : "necesita historial"}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-amber-800">Auto-match</div>
            <AlarmClock className="h-4 w-4 text-amber-700" />
          </div>
          <div className="mt-2 font-heading text-3xl font-bold text-slate-900">{stats?.auto_matched ?? 0}</div>
          <div className="text-xs text-slate-500">Cerradas automáticamente por alarma</div>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-slate-600">Falsos positivos</div>
            <ThumbsDown className="h-4 w-4 text-slate-500" />
          </div>
          <div className="mt-2 font-heading text-3xl font-bold text-slate-900">{stats?.dismissed ?? 0}</div>
          <div className="text-xs text-slate-500">Descartadas por el operador</div>
        </div>
      </div>

      {/* Controles */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium uppercase text-slate-500">Planta</label>
          <select
            value={selectedPlant}
            onChange={(e) => setSelectedPlant(e.target.value)}
            className="mt-1 w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
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
            className="inline-flex h-10 items-center gap-2 rounded-lg bg-sky-600 px-4 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wand2 className="h-4 w-4" />}
            Correr predicción
          </button>
        ) : null}
        <button
          type="button"
          onClick={() => {
            void loadRows();
            void loadStats();
          }}
          className="inline-flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-4 w-4" /> Refrescar
        </button>
        <div className="ml-auto flex flex-wrap items-end gap-3">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar planta, causa…"
            className="h-10 w-64 rounded-lg border border-slate-200 bg-white px-3 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          />
          <button
            type="button"
            onClick={() => setShowMethod((v) => !v)}
            className="inline-flex h-10 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
          >
            <Brain className="h-3 w-3" /> {showMethod ? "Ocultar método" : "¿Cómo funciona?"}
          </button>
        </div>
        {error ? <span className="w-full text-xs text-rose-600">{error}</span> : null}
      </div>

      {/* Filter tiles */}
      <div className="flex flex-wrap gap-2">
        {(
          [
            { id: "all", label: "Todas", count: rows.length },
            { id: "open", label: "Abiertas (sin outcome)", count: rows.filter((r) => !r.outcome).length },
            { id: "high-risk", label: "Alto riesgo (≥60%)", count: rows.filter((r) => r.probability >= 0.6).length },
            { id: "alarm", label: "Por alarma", count: rows.filter((r) => r.triggerKind === "alarm").length },
            { id: "anomaly", label: "Por anomalía", count: rows.filter((r) => r.triggerKind === "anomaly").length },
            { id: "scheduled", label: "Programadas", count: rows.filter((r) => r.triggerKind === "scheduled").length },
          ] as Array<{ id: FilterKind; label: string; count: number }>
        ).map((f) => (
          <button
            key={f.id}
            onClick={() => setFilter(f.id)}
            className={
              "inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs transition " +
              (filter === f.id
                ? "border-sky-400 bg-sky-50 text-sky-800"
                : "border-slate-200 bg-white text-slate-600 hover:border-slate-300")
            }
          >
            {f.label}
            <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
              {f.count}
            </span>
          </button>
        ))}
      </div>

      {showMethod ? (
        <div className="rounded-2xl border border-sky-200 bg-sky-50/60 p-5 text-sm text-slate-700">
          <div className="mb-2 flex items-center gap-2 font-semibold text-sky-800">
            <Brain className="h-4 w-4" /> Cómo piensa el modelo
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              <b>Heurística</b> evalúa 5 señales sobre los últimos 14 días: pendiente de PR, uptime, σ voltaje,
              temperatura y alarmas recientes. Cada señal suma al score (0–1).
            </li>
            <li>
              Se clasifica en <code>failure</code>, <code>degradation</code> o <code>low_gen</code> según la señal
              dominante, y se proyecta la ventana (3/7/14/30 días).
            </li>
            <li>
              <b>RAG lite:</b> antes de llamar al LLM, buscamos los últimos 5 outcomes del mismo inversor y las
              remediaciones que funcionaron. Eso viaja dentro del prompt a MiniMax como contexto.
            </li>
            <li>
              <b>MiniMax</b> devuelve CAUSA + ACCION en 2 líneas, citando historial cuando aplica.
            </li>
            <li>
              <b>Outcome loop:</b> cuando nace una alarma, emparejamos predicciones abiertas → accuracy se actualiza
              sola (auto-matched). El operador puede marcar manualmente confirmed/dismissed.
            </li>
            <li>
              <b>Triggers:</b> <i>scheduled</i> (manual/cron), <i>alarm</i> (nace al crearse una alarma, adjunta
              sourceAlarmId), <i>anomaly</i> (ruptura de baseline z-score en ingest, antes de la alarma del
              proveedor).
            </li>
          </ol>
        </div>
      ) : null}

      {/* Lista de predicciones */}
      <div className="space-y-3">
        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No hay predicciones para este filtro.
          </div>
        ) : null}
        {filtered.map((r) => {
          const meta = TRIGGER_META[r.triggerKind];
          return (
            <div
              key={r.id}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={"rounded-full px-2 py-0.5 text-xs font-semibold ring-1 " + typeTone(r.predictedType)}>
                      {r.predictedType}
                    </span>
                    <span className={"inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 " + meta.badge}>
                      {meta.icon}
                      {meta.label}
                    </span>
                    {r.sourceAlarm ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] text-rose-700 ring-1 ring-rose-100">
                        <AlertTriangle className="h-3 w-3" />
                        {r.sourceAlarm.type}: {r.sourceAlarm.message.slice(0, 60)}
                      </span>
                    ) : null}
                    {r.outcome ? (
                      <span
                        className={
                          "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " +
                          (r.outcome.status === "confirmed" || r.outcome.status === "auto_matched"
                            ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
                            : "bg-slate-100 text-slate-600 ring-slate-200")
                        }
                      >
                        {r.outcome.status === "auto_matched"
                          ? "✓ auto-matched"
                          : r.outcome.status === "confirmed"
                            ? "✓ confirmada"
                            : "✗ descartada"}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-slate-900">
                    {r.plantName} <span className="text-xs font-normal text-slate-500">({r.plantCode}) · {r.client}</span>
                  </div>
                  <div className="mt-3 text-sm text-slate-700">
                    <b className="text-slate-900">Causa:</b> {r.rootCause || "—"}
                  </div>
                  <div className="mt-1 text-sm text-slate-700">
                    <b className="text-slate-900">Acción sugerida:</b> {r.suggestedAction || "—"}
                  </div>
                  {r.remediations.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {r.remediations.map((rem) => (
                        <Link
                          key={rem.id}
                          href={`/predicciones#rem-${rem.id}`}
                          className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] text-slate-700 hover:bg-slate-100"
                        >
                          {rem.executionMode === "real" ? "REAL" : "MOCK"} · {rem.commandType} · {rem.status}
                        </Link>
                      ))}
                    </div>
                  ) : null}
                </div>
                <div className="flex flex-col items-end gap-2">
                  <div className="flex h-16 w-16 flex-col items-center justify-center rounded-full bg-slate-50 ring-2 ring-slate-100">
                    <div className="text-[10px] uppercase text-slate-400">prob</div>
                    <div className="font-heading text-base font-bold text-slate-900">
                      {Math.round(r.probability * 100)}%
                    </div>
                  </div>
                  <div className="h-2 w-28 overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={"h-full rounded-full " + probTone(r.probability)}
                      style={{ width: `${Math.round(r.probability * 100)}%` }}
                    />
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {r.daysToEvent != null ? `~${r.daysToEvent}d` : "s/d"} · {new Date(r.generatedAt).toLocaleString("es-CO")}
                  </div>
                  {!r.outcome && canRun ? (
                    <div className="flex gap-1">
                      <button
                        type="button"
                        onClick={() => submitFeedback(r.id, "confirmed")}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100"
                        title="Confirmar — ya ocurrió"
                      >
                        <ThumbsUp className="h-3 w-3" /> Confirmar
                      </button>
                      <button
                        type="button"
                        onClick={() => submitFeedback(r.id, "dismissed")}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                        title="Descartar — falso positivo"
                      >
                        <ThumbsDown className="h-3 w-3" /> Descartar
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <RemediationsPanel canRun={canRun} />
    </div>
  );
}

function RemediationsPanel({ canRun }: { canRun: boolean }) {
  type Rem = {
    id: string;
    plantId: string;
    plant: { id: string; name: string; code: string } | null;
    deviceExternalId: string | null;
    commandType: string;
    reason: string;
    status: string;
    executionMode: string;
    proposedBy: string;
    proposedAt: string;
    executedAt: string | null;
    verifiedOutcome: string | null;
    providerOrderId: string | null;
    alarm: { id: string; type: string; severity: string; message: string } | null;
    executionResult: Record<string, unknown> | null;
  };

  const [rows, setRows] = useState<Rem[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    try {
      const r = await fetch("/api/remediations");
      const j = await r.json();
      setRows(j.rows);
    } catch {
      /* silent */
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const action = async (id: string, act: "approve" | "reject" | "execute" | "verify") => {
    setBusy(`${id}:${act}`);
    setError(null);
    try {
      const r = await fetch(`/api/remediations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: act, reason: act === "reject" ? "Rechazada desde UI" : undefined }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "error");
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const statusTone = (s: string) => {
    if (s === "proposed") return "bg-amber-50 text-amber-800 ring-amber-200";
    if (s === "approved" || s === "executing") return "bg-sky-50 text-sky-800 ring-sky-200";
    if (s === "executed") return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    if (s === "failed" || s === "rejected") return "bg-rose-50 text-rose-700 ring-rose-200";
    return "bg-slate-100 text-slate-700 ring-slate-200";
  };

  return (
    <div id="remediations" className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading text-base font-semibold">Remediaciones sugeridas</h2>
          <p className="text-xs text-slate-500">
            Cada alarma en plantas con autonomía ≥ <i>approval</i> genera una propuesta. El toggle <b>mock/real</b>
            vive en <Link href="/configuracion" className="text-sky-700 underline">Configuración</Link>.
          </p>
        </div>
        <button
          onClick={() => void load()}
          className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-xs text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className="h-3 w-3" /> Refrescar
        </button>
      </div>
      {error ? <div className="mt-2 text-xs text-rose-600">{error}</div> : null}
      <div className="mt-4 overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-3 py-2">Planta</th>
              <th className="px-3 py-2">Comando</th>
              <th className="px-3 py-2">Origen</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">Modo</th>
              <th className="px-3 py-2">Propuesta</th>
              <th className="px-3 py-2 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {(rows ?? []).map((r) => (
              <tr key={r.id} id={`rem-${r.id}`} className="align-top hover:bg-slate-50">
                <td className="px-3 py-2">
                  <div className="font-medium text-slate-900">{r.plant?.name ?? "—"}</div>
                  <div className="text-[11px] text-slate-500">{r.plant?.code ?? ""}</div>
                </td>
                <td className="px-3 py-2">
                  <div className="font-mono text-xs text-slate-800">{r.commandType}</div>
                  <div className="text-[11px] text-slate-500">{r.reason}</div>
                </td>
                <td className="px-3 py-2 text-xs text-slate-600">
                  {r.alarm ? `alarma ${r.alarm.severity}` : r.proposedBy === "ai" ? "AI" : "manual"}
                </td>
                <td className="px-3 py-2">
                  <span className={"rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " + statusTone(r.status)}>
                    {r.status}
                  </span>
                </td>
                <td className="px-3 py-2">
                  <span
                    className={
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 " +
                      (r.executionMode === "real"
                        ? "bg-rose-50 text-rose-700 ring-rose-200"
                        : "bg-slate-50 text-slate-600 ring-slate-200")
                    }
                  >
                    {r.executionMode.toUpperCase()}
                  </span>
                </td>
                <td className="px-3 py-2 text-[11px] text-slate-600">
                  {new Date(r.proposedAt).toLocaleString("es-CO")}
                </td>
                <td className="px-3 py-2 text-right">
                  {canRun ? (
                    <div className="flex justify-end gap-1">
                      {r.status === "proposed" ? (
                        <>
                          <button
                            onClick={() => action(r.id, "approve")}
                            disabled={busy === `${r.id}:approve`}
                            className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] text-emerald-800 hover:bg-emerald-100 disabled:opacity-60"
                          >
                            Aprobar
                          </button>
                          <button
                            onClick={() => action(r.id, "reject")}
                            disabled={busy === `${r.id}:reject`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            Rechazar
                          </button>
                        </>
                      ) : null}
                      {r.status === "approved" ? (
                        <button
                          onClick={() => action(r.id, "execute")}
                          disabled={busy === `${r.id}:execute`}
                          className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-[11px] text-white hover:bg-sky-700 disabled:opacity-60"
                        >
                          <Play className="h-3 w-3" /> Ejecutar
                        </button>
                      ) : null}
                      {r.status === "executed" && !r.verifiedOutcome ? (
                        <button
                          onClick={() => action(r.id, "verify")}
                          disabled={busy === `${r.id}:verify`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          Verificar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {r.verifiedOutcome ? (
                    <div className="text-[11px] text-emerald-700">✓ {r.verifiedOutcome}</div>
                  ) : null}
                  {r.providerOrderId ? (
                    <div className="text-[10px] text-slate-500">order: {r.providerOrderId}</div>
                  ) : null}
                </td>
              </tr>
            ))}
            {(rows ?? []).length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-500">
                  Sin remediaciones. Cuando nazca una alarma en una planta con autonomía ≥ approval, aparecerá aquí.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
