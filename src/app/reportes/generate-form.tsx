"use client";
import { useState } from "react";

type Plant = { id: string; label: string; client: string };

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

export function GenerateReportForm({ plants }: { plants: Plant[] }) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState<number | null>(null);

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

  return (
    <div>
      <label className="mt-4 block text-xs font-medium uppercase text-slate-500">Planta</label>
      <select
        value={plantId}
        onChange={(e) => setPlantId(e.target.value)}
        className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
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
        className="mt-4 w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
      >
        {busy ? "Generando…" : "Generar reporte"}
      </button>
      {elapsed != null ? (
        <p className="mt-2 text-xs text-emerald-700">✓ Generado en {(elapsed / 1000).toFixed(1)}s</p>
      ) : null}
      {error ? <p className="mt-2 text-xs text-red-600">{error}</p> : null}

      {result ? (
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 print:bg-white">
          <div className="flex items-start justify-between">
            <div>
              <div className="text-xs uppercase text-slate-500">Reporte mensual</div>
              <h3 className="font-heading text-lg font-semibold">{result.plant.name}</h3>
              <div className="text-xs text-slate-500">
                {result.plant.client} · {result.plant.code} · {result.metrics.periodLabel}
              </div>
            </div>
            <button
              onClick={() => window.print()}
              className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium hover:bg-slate-100 print:hidden"
            >
              ⎙ Imprimir / PDF
            </button>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
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
            <div className="mt-3 rounded-md bg-red-100 p-2.5 text-xs text-red-800">
              ⚠️ Exposición a penalización: ${result.metrics.penaltyExposureCop.toLocaleString("es-CO")} COP
            </div>
          ) : null}

          <div className="mt-4 rounded-lg border border-violet-200 bg-violet-50 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase text-violet-700">
              <span>✦</span> Resumen ejecutivo · MiniMax
            </div>
            <div className="whitespace-pre-wrap text-sm text-slate-800">{result.narrative}</div>
          </div>
        </div>
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
    <div className="rounded-md bg-white p-2">
      <div className="text-[10px] uppercase text-slate-500">{label}</div>
      <div
        className={`font-heading text-sm font-semibold ${
          tone === "good" ? "text-emerald-700" : tone === "bad" ? "text-red-700" : "text-slate-900"
        }`}
      >
        {value}
      </div>
      {target ? <div className="text-[10px] text-slate-400">meta {target}</div> : null}
    </div>
  );
}
