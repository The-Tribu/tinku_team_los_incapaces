"use client";

import { useState } from "react";
import { Loader2 } from "lucide-react";
import { GenerationVsBaseline, type GenerationPoint } from "./generation-vs-baseline";

type UpstreamPoint = {
  ts: string;
  energyKwh: number;
  irradianceWm2?: number;
  theoryKwh?: number;
  exportedKwh?: number;
};

type UpstreamResp =
  | { source: "upstream"; points: UpstreamPoint[] }
  | { error: string; retry_after_seconds?: number };

function formatHour(iso: string): string {
  return new Date(iso).toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

/**
 * Wrapper cliente del chart generación vs baseline. Mantiene los datos
 * locales pre-calculados en el server y, opcionalmente, permite consultar
 * directamente la API del fabricante (Huawei getKpiStationHour) como
 * contraste. Solo se muestra el toggle si la planta es Huawei.
 */
export function GenerationPanel({
  plantId,
  hours,
  hasUpstream,
}: {
  plantId: string;
  hours: GenerationPoint[];
  hasUpstream: boolean;
}) {
  const [mode, setMode] = useState<"local" | "upstream">("local");
  const [loading, setLoading] = useState(false);
  const [upstream, setUpstream] = useState<GenerationPoint[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function loadUpstream() {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/plants/${plantId}/history?source=upstream`);
      const json = (await res.json()) as UpstreamResp;
      if (!res.ok || "error" in json) {
        const msg = "error" in json ? json.error : `HTTP ${res.status}`;
        const retry =
          "error" in json && json.retry_after_seconds
            ? ` (reintentá en ${json.retry_after_seconds}s)`
            : "";
        setError(`No se pudo obtener datos del proveedor: ${msg}${retry}`);
        setMode("local");
        return;
      }
      const points: GenerationPoint[] = json.points.map((p) => ({
        ts: p.ts,
        label: formatHour(p.ts),
        // getKpiStationHour devuelve energía (kWh) por hora, que es una
        // aproximación razonable a potencia media (kW) en esa hora.
        actual: p.energyKwh,
        baseline: p.theoryKwh ?? null,
      }));
      setUpstream(points);
      setMode("upstream");
    } catch (err) {
      setError((err as Error).message);
      setMode("local");
    } finally {
      setLoading(false);
    }
  }

  const data =
    mode === "upstream" && upstream ? upstream : hours;

  return (
    <div className="space-y-2">
      {hasUpstream ? (
        <div className="flex items-center justify-between gap-2 text-[11px]">
          <div className="inline-flex overflow-hidden rounded-md border border-slate-200 bg-white text-slate-600">
            <button
              type="button"
              onClick={() => setMode("local")}
              className={`px-2.5 py-1 font-medium transition ${
                mode === "local"
                  ? "bg-emerald-50 text-emerald-700"
                  : "hover:bg-slate-50"
              }`}
            >
              Local (DB)
            </button>
            <button
              type="button"
              onClick={() => {
                if (upstream) setMode("upstream");
                else void loadUpstream();
              }}
              disabled={loading}
              className={`inline-flex items-center gap-1 border-l border-slate-200 px-2.5 py-1 font-medium transition ${
                mode === "upstream"
                  ? "bg-emerald-50 text-emerald-700"
                  : "hover:bg-slate-50"
              } disabled:opacity-60`}
            >
              {loading ? <Loader2 className="h-3 w-3 animate-spin" /> : null}
              Huawei upstream
            </button>
          </div>
          {error ? <span className="text-red-600">{error}</span> : null}
        </div>
      ) : null}
      <GenerationVsBaseline data={data} height={260} />
    </div>
  );
}
