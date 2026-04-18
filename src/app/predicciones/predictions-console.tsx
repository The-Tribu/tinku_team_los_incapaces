"use client";
import { useState } from "react";

type Plant = { id: string; label: string; client: string };
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

export function PredictionsConsole({
  plants,
  initialRows,
}: {
  plants: Plant[];
  initialRows: Row[];
}) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>(initialRows);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

  async function run() {
    if (!plantId) return;
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
        plantName: plant.label.split(" · ")[1] ?? plant.label,
        plantCode: plant.label.split(" · ")[0] ?? "",
        client: plant.client,
      }));
      setRows([...newRows, ...rows]);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-1">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-base font-semibold">Ejecutar predicción</h2>
          <p className="mt-1 text-xs text-slate-500">
            Analizamos 14 días de PR, uptime, voltaje y temperatura. MiniMax diagnostica la causa raíz.
          </p>
          <label className="mt-4 block text-xs font-medium uppercase text-slate-500">Planta</label>
          <select
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-violet-500 focus:outline-none focus:ring-2 focus:ring-violet-100"
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          <button
            onClick={() => void run()}
            disabled={busy || !plantId}
            className="mt-4 w-full rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-700 disabled:opacity-50"
          >
            {busy ? "Analizando…" : "✦ Predecir fallas"}
          </button>
          {elapsed != null ? (
            <p className="mt-2 text-xs text-violet-700">✓ Analizado en {(elapsed / 1000).toFixed(1)}s</p>
          ) : null}
          {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}
        </div>

        <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-4 text-xs text-slate-700">
          <div className="font-semibold text-violet-800">¿Cómo funciona?</div>
          <ul className="mt-2 space-y-1 text-[11px]">
            <li>• Slope PR últimos 14 días</li>
            <li>• Uptime promedio &lt; 90%</li>
            <li>• σ voltaje &gt; 15V</li>
            <li>• Temperatura &gt; 55°C</li>
            <li>• Alarmas recientes</li>
            <li>• MiniMax → causa raíz + acción</li>
          </ul>
        </div>
      </div>

      <div className="lg:col-span-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 font-heading text-base font-semibold">Predicciones recientes</h2>
          {rows.length === 0 ? (
            <div className="py-12 text-center text-sm text-slate-500">
              Aún no hay predicciones. Ejecuta la primera ↑
            </div>
          ) : (
            <div className="space-y-3">
              {rows.map((r) => (
                <PredictionCard key={r.id} row={r} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PredictionCard({ row }: { row: Row }) {
  const pct = Math.round(row.probability * 100);
  const riskColor =
    pct >= 70 ? "bg-red-100 text-red-800 border-red-200" :
    pct >= 40 ? "bg-amber-100 text-amber-800 border-amber-200" :
    "bg-emerald-100 text-emerald-800 border-emerald-200";
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-heading text-sm font-semibold">{row.plantName}</div>
          <div className="text-xs text-slate-500">
            {row.plantCode} · {row.client} · {new Date(row.generatedAt).toLocaleString("es-CO")}
          </div>
        </div>
        <div className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-bold ${riskColor}`}>
          {pct}% {row.predictedType}
        </div>
      </div>
      <div className="mt-2 flex items-center gap-3 text-xs text-slate-600">
        <span>⏳ {row.daysToEvent ?? "—"} días</span>
        {row.confidence ? <span>· confianza {Math.round(row.confidence * 100)}%</span> : null}
      </div>
      {row.rootCause ? (
        <div className="mt-3 rounded-md border border-violet-200 bg-violet-50 p-2.5">
          <div className="text-[10px] font-bold uppercase text-violet-700">✦ Causa raíz · MiniMax</div>
          <div className="mt-1 text-xs text-slate-800">{row.rootCause}</div>
        </div>
      ) : null}
      {row.suggestedAction ? (
        <div className="mt-2 text-xs">
          <span className="font-semibold text-emerald-700">Próxima acción:</span>{" "}
          <span className="text-slate-800">{row.suggestedAction}</span>
        </div>
      ) : null}
    </div>
  );
}
