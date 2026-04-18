"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertOctagon,
  AlertTriangle,
  BellPlus,
  Check,
  CheckCircle2,
  ChevronsUpDown,
  Clock,
  Copy,
  FileDown,
  Lightbulb,
  Loader2,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
  Wrench,
  X,
  Zap,
} from "lucide-react";

type Plant = { id: string; code: string; name: string; client: string };
type Row = {
  id: string;
  predictedType: string;
  probability: number;
  daysToEvent: number | null;
  confidence: number | null;
  rootCause: string;
  suggestedAction: string;
  generatedAt: string;
  plantName: string;
  plantCode: string;
  client: string;
};

type Filter = "all" | "critical" | "warning" | "low";

export function PredictionsConsole({
  plants,
  initialRows,
  canRun,
}: {
  plants: Plant[];
  initialRows: Row[];
  canRun: boolean;
}) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");

  const selectedPlant = plants.find((p) => p.id === plantId) ?? null;

  async function run() {
    if (!plantId || !canRun) return;
    setBusy(true);
    setError(null);
    const t0 = performance.now();
    try {
      const res = await fetch("/api/predictions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setElapsed(Math.round(performance.now() - t0));
      const plant = plants.find((p) => p.id === plantId)!;
      const newRows: Row[] = json.predictions.map((p: Row, idx: number) => ({
        ...p,
        id: `new-${Date.now()}-${idx}`,
        generatedAt: new Date().toISOString(),
        plantName: plant.name,
        plantCode: plant.code,
        client: plant.client,
      }));
      setRows([...newRows, ...rows]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const counts = useMemo(() => {
    let critical = 0, warning = 0, low = 0;
    for (const r of rows) {
      const pct = Math.round(r.probability * 100);
      if (pct >= 70) critical++;
      else if (pct >= 40) warning++;
      else low++;
    }
    return { all: rows.length, critical, warning, low };
  }, [rows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      const pct = Math.round(r.probability * 100);
      if (filter === "critical" && pct < 70) return false;
      if (filter === "warning" && (pct < 40 || pct >= 70)) return false;
      if (filter === "low" && pct >= 40) return false;
      if (!q) return true;
      return (
        r.plantName.toLowerCase().includes(q) ||
        r.plantCode.toLowerCase().includes(q) ||
        r.client.toLowerCase().includes(q) ||
        r.rootCause.toLowerCase().includes(q) ||
        r.suggestedAction.toLowerCase().includes(q)
      );
    });
  }, [rows, filter, query]);

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* ── Panel izquierdo: ejecutar predicción ─────────────────────── */}
      <div className="lg:col-span-1 space-y-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 text-white">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <h2 className="font-heading text-base font-semibold">Ejecutar predicción</h2>
              <p className="text-[11px] text-slate-500">MiniMax + heurística · 14 días</p>
            </div>
          </div>

          <label className="mt-5 block text-xs font-medium uppercase text-slate-500">
            Planta a analizar
          </label>
          <PlantCombobox
            plants={plants}
            value={plantId}
            onChange={setPlantId}
            disabled={busy || !canRun}
          />

          {selectedPlant ? (
            <div className="mt-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-[11px] text-slate-600">
              <span className="font-medium text-slate-700">{selectedPlant.code}</span>
              {" · "}
              <span>{selectedPlant.client}</span>
            </div>
          ) : null}

          <button
            onClick={() => void run()}
            disabled={busy || !plantId || !canRun}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-violet-600 to-violet-700 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:from-violet-700 hover:to-violet-800 disabled:opacity-50"
          >
            {busy ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analizando señales…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Predecir fallas
              </>
            )}
          </button>

          {!canRun ? (
            <p className="mt-2 flex items-center gap-1 text-[11px] text-slate-500">
              <ShieldCheck className="h-3 w-3" />
              Tu rol no tiene permiso para ejecutar predicciones.
            </p>
          ) : null}

          {elapsed != null ? (
            <div className="mt-3 flex items-center gap-1.5 rounded-md bg-violet-50 px-2.5 py-1.5 text-[11px] text-violet-700">
              <CheckCircle2 className="h-3.5 w-3.5" />
              Análisis completado en {(elapsed / 1000).toFixed(1)}s
            </div>
          ) : null}
          {error ? (
            <div className="mt-3 flex items-start gap-1.5 rounded-md bg-red-50 px-2.5 py-1.5 text-[11px] text-red-700">
              <AlertOctagon className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </div>
          ) : null}
        </div>

        <div className="rounded-2xl border border-violet-200 bg-gradient-to-br from-violet-50 to-indigo-50 p-5">
          <div className="flex items-center gap-2 text-violet-800">
            <Lightbulb className="h-4 w-4" />
            <span className="font-heading text-sm font-semibold">¿Cómo funciona?</span>
          </div>
          <ul className="mt-3 space-y-1.5 text-[11px] text-slate-700">
            <li className="flex items-center gap-2">
              <Zap className="h-3 w-3 text-violet-500" /> Slope PR últimos 14 días
            </li>
            <li className="flex items-center gap-2">
              <Clock className="h-3 w-3 text-violet-500" /> Uptime promedio &lt; 90%
            </li>
            <li className="flex items-center gap-2">
              <AlertTriangle className="h-3 w-3 text-violet-500" /> σ voltaje &gt; 15V
            </li>
            <li className="flex items-center gap-2">
              <Target className="h-3 w-3 text-violet-500" /> Temperatura &gt; 55°C
            </li>
            <li className="flex items-center gap-2">
              <Sparkles className="h-3 w-3 text-violet-500" /> MiniMax → causa raíz + acción
            </li>
          </ul>
        </div>
      </div>

      {/* ── Panel derecho: predicciones ──────────────────────────────── */}
      <div className="lg:col-span-2 space-y-4">
        {/* KPIs de riesgo */}
        <div className="grid grid-cols-4 gap-3">
          <RiskTile
            active={filter === "all"}
            onClick={() => setFilter("all")}
            label="Total"
            count={counts.all}
            tone="slate"
          />
          <RiskTile
            active={filter === "critical"}
            onClick={() => setFilter("critical")}
            label="Crítico ≥70%"
            count={counts.critical}
            tone="red"
          />
          <RiskTile
            active={filter === "warning"}
            onClick={() => setFilter("warning")}
            label="Aviso 40-69%"
            count={counts.warning}
            tone="amber"
          />
          <RiskTile
            active={filter === "low"}
            onClick={() => setFilter("low")}
            label="Bajo <40%"
            count={counts.low}
            tone="emerald"
          />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h2 className="font-heading text-base font-semibold">Predicciones recientes</h2>
            <div className="relative w-56">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar en predicciones…"
                className="w-full rounded-lg border border-slate-200 py-1.5 pl-8 pr-3 text-xs focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>

          {filteredRows.length === 0 ? (
            <EmptyState hasRows={rows.length > 0} />
          ) : (
            <div className="space-y-3">
              {filteredRows.map((r) => (
                <PredictionCard key={r.id} row={r} canAct={canRun} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Combobox con buscador ─────────────────────────────────────────────
function PlantCombobox({
  plants,
  value,
  onChange,
  disabled,
}: {
  plants: Plant[];
  value: string;
  onChange: (id: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  const selected = plants.find((p) => p.id === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return plants;
    return plants.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q),
    );
  }, [plants, query]);

  useEffect(() => {
    if (!open) return;
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  return (
    <div ref={ref} className="relative mt-1">
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition hover:border-slate-300 focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100 disabled:opacity-50"
      >
        <span className={selected ? "text-slate-900" : "text-slate-400"}>
          {selected ? (
            <>
              <span className="font-medium">{selected.name}</span>
              <span className="ml-1 text-slate-500">· {selected.code}</span>
            </>
          ) : (
            "Selecciona una planta…"
          )}
        </span>
        <ChevronsUpDown className="h-4 w-4 shrink-0 text-slate-400" />
      </button>

      {open ? (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lg">
          <div className="border-b border-slate-100 p-2">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar por nombre, código o cliente…"
                className="w-full rounded-lg border border-slate-200 bg-slate-50 py-1.5 pl-8 pr-3 text-xs focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
              />
            </div>
          </div>
          <div className="max-h-72 overflow-y-auto">
            {filtered.length === 0 ? (
              <div className="px-4 py-6 text-center text-xs text-slate-500">
                Sin resultados para "{query}"
              </div>
            ) : (
              filtered.map((p) => {
                const isSelected = p.id === value;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onChange(p.id);
                      setOpen(false);
                      setQuery("");
                    }}
                    className={`flex w-full items-start gap-2 px-3 py-2 text-left text-xs transition hover:bg-violet-50 ${
                      isSelected ? "bg-violet-50/60" : ""
                    }`}
                  >
                    <span className="mt-0.5 w-4 text-violet-600">
                      {isSelected ? <Check className="h-3.5 w-3.5" /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium text-slate-900">{p.name}</div>
                      <div className="truncate text-[11px] text-slate-500">
                        {p.code} · {p.client}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-3 py-1.5 text-[10px] text-slate-500">
            {filtered.length} de {plants.length} plantas
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ─── Risk tile ─────────────────────────────────────────────────────────
const TILE_TONES: Record<string, { border: string; bg: string; text: string; dot: string }> = {
  slate: { border: "border-slate-200", bg: "bg-slate-50", text: "text-slate-700", dot: "bg-slate-400" },
  red: { border: "border-red-200", bg: "bg-red-50", text: "text-red-700", dot: "bg-red-500" },
  amber: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", dot: "bg-amber-500" },
  emerald: { border: "border-emerald-200", bg: "bg-emerald-50", text: "text-emerald-700", dot: "bg-emerald-500" },
};

function RiskTile({
  label,
  count,
  tone,
  active,
  onClick,
}: {
  label: string;
  count: number;
  tone: keyof typeof TILE_TONES;
  active: boolean;
  onClick: () => void;
}) {
  const t = TILE_TONES[tone];
  return (
    <button
      onClick={onClick}
      className={`rounded-xl border bg-white px-3 py-2.5 text-left transition hover:shadow-sm ${
        active ? `${t.border} ${t.bg}` : "border-slate-200"
      }`}
    >
      <div className="flex items-center justify-between">
        <span className={`text-[11px] font-medium uppercase tracking-wide ${active ? t.text : "text-slate-500"}`}>
          {label}
        </span>
        <span className={`h-1.5 w-1.5 rounded-full ${t.dot}`} />
      </div>
      <div className={`mt-1 font-heading text-2xl font-bold tabular-nums ${active ? t.text : "text-slate-800"}`}>
        {count}
      </div>
    </button>
  );
}

// ─── Empty state ───────────────────────────────────────────────────────
function EmptyState({ hasRows }: { hasRows: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-violet-100 text-violet-600">
        <Sparkles className="h-5 w-5" />
      </div>
      <p className="mt-3 text-sm font-medium text-slate-700">
        {hasRows ? "Sin predicciones en este filtro" : "Aún no hay predicciones"}
      </p>
      <p className="mt-1 max-w-xs text-xs text-slate-500">
        {hasRows
          ? "Ajusta los filtros o ejecuta una nueva predicción."
          : "Selecciona una planta y ejecuta tu primera predicción con MiniMax."}
      </p>
    </div>
  );
}

// ─── Prediction card ───────────────────────────────────────────────────
function PredictionCard({ row, canAct }: { row: Row; canAct: boolean }) {
  const pct = Math.round(row.probability * 100);
  const isCritical = pct >= 70;
  const isWarning = pct >= 40 && pct < 70;
  const tone = isCritical
    ? { border: "border-red-200", stripe: "bg-red-500", badge: "bg-red-100 text-red-800 border-red-200", icon: <AlertOctagon className="h-4 w-4 text-red-500" /> }
    : isWarning
      ? { border: "border-amber-200", stripe: "bg-amber-500", badge: "bg-amber-100 text-amber-800 border-amber-200", icon: <AlertTriangle className="h-4 w-4 text-amber-500" /> }
      : { border: "border-emerald-200", stripe: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-800 border-emerald-200", icon: <CheckCircle2 className="h-4 w-4 text-emerald-500" /> };

  const [done, setDone] = useState<string | null>(null);

  function markDone(key: string) {
    setDone(key);
    setTimeout(() => setDone(null), 1500);
  }

  async function copyAction() {
    try {
      await navigator.clipboard.writeText(
        `[${row.plantCode}] ${row.plantName}\nCausa raíz: ${row.rootCause}\nAcción: ${row.suggestedAction}`,
      );
      markDone("copy");
    } catch {
      /* ignore */
    }
  }

  return (
    <article
      className={`group relative overflow-hidden rounded-xl border bg-white transition hover:shadow-md ${tone.border}`}
    >
      <div className={`absolute inset-y-0 left-0 w-1 ${tone.stripe}`} />
      <div className="p-4 pl-5">
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              {tone.icon}
              <h3 className="font-heading text-sm font-semibold text-slate-900">{row.plantName}</h3>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-slate-500">
              <span className="font-mono">{row.plantCode}</span>
              <span>·</span>
              <span>{row.client}</span>
              <span>·</span>
              <time>{new Date(row.generatedAt).toLocaleString("es-CO")}</time>
            </div>
          </div>
          <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${tone.badge}`}>
            {pct}% {row.predictedType}
          </div>
        </header>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1">
            <Clock className="h-3 w-3 text-slate-400" />
            En {row.daysToEvent ?? "—"} días
          </span>
          {row.confidence ? (
            <span className="inline-flex items-center gap-1.5 rounded-md bg-slate-50 px-2 py-1">
              <ShieldCheck className="h-3 w-3 text-slate-400" />
              Confianza {Math.round(row.confidence * 100)}%
            </span>
          ) : null}
        </div>

        {row.rootCause ? (
          <div className="mt-3 rounded-lg border border-violet-200 bg-violet-50/60 p-3">
            <div className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-violet-700">
              <Sparkles className="h-3 w-3" />
              Causa raíz · MiniMax
            </div>
            <p className="mt-1 text-xs leading-relaxed text-slate-800">{row.rootCause}</p>
          </div>
        ) : null}

        {row.suggestedAction ? (
          <div className="mt-2 flex items-start gap-2 rounded-lg bg-emerald-50/60 p-3">
            <Wrench className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600" />
            <div className="text-xs">
              <span className="font-semibold text-emerald-800">Próxima acción: </span>
              <span className="text-slate-800">{row.suggestedAction}</span>
            </div>
          </div>
        ) : null}

        {canAct ? (
          <div className="mt-3 flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-3">
            <ActionButton onClick={copyAction} done={done === "copy"} icon={<Copy className="h-3.5 w-3.5" />}>
              {done === "copy" ? "Copiado" : "Copiar"}
            </ActionButton>
            <ActionButton
              onClick={() => markDone("alarm")}
              done={done === "alarm"}
              icon={<BellPlus className="h-3.5 w-3.5" />}
            >
              {done === "alarm" ? "Creada" : "Crear alarma"}
            </ActionButton>
            <ActionButton
              onClick={() => markDone("report")}
              done={done === "report"}
              icon={<FileDown className="h-3.5 w-3.5" />}
            >
              Exportar
            </ActionButton>
            <ActionButton
              onClick={() => markDone("ack")}
              done={done === "ack"}
              icon={<X className="h-3.5 w-3.5" />}
              tone="ghost"
            >
              Descartar
            </ActionButton>
          </div>
        ) : null}
      </div>
    </article>
  );
}

function ActionButton({
  onClick,
  icon,
  children,
  done,
  tone = "solid",
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
  done?: boolean;
  tone?: "solid" | "ghost";
}) {
  const base = "inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-[11px] font-medium transition";
  const styles =
    tone === "ghost"
      ? "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
      : "border border-slate-200 bg-white text-slate-700 hover:border-violet-300 hover:bg-violet-50 hover:text-violet-700";
  return (
    <button onClick={onClick} className={`${base} ${styles} ${done ? "border-emerald-300 bg-emerald-50 text-emerald-700" : ""}`}>
      {done ? <Check className="h-3.5 w-3.5" /> : icon}
      {children}
    </button>
  );
}
