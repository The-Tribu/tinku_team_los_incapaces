"use client";
import { useEffect, useMemo, useState } from "react";
import { Info } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Plant = { id: string; label: string; client: string; capacityKwp: number };
type DailyRow = { date: string; ghiKwhM2: number; expectedKwhDay: number; sunriseLocal: string; sunsetLocal: string };
type HourlyRow = { ts: string; cloudCoverPct: number; ghiWm2: number; tempC: number; expectedKwAc: number };

// Tarifa promedio COP/kWh usada para convertir energía a lucro cesante.
const TARIFF_COP_PER_KWH = 680;

// Parsea "YYYY-MM-DD" en medianoche local (evita el shift UTC de `new Date(iso)`).
function parseLocalDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

function startOfToday(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function formatLocal(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return parseLocalDate(iso).toLocaleDateString("es-CO", opts);
}

function formatCOP(v: number): string {
  return `$${Math.round(v).toLocaleString("es-CO")}`;
}

export function WeatherConsole({ plants }: { plants: Plant[] }) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);
  const [showMethod, setShowMethod] = useState(false);

  useEffect(() => {
    if (!plantId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/weather?plantId=${plantId}`)
      .then((r) => r.json())
      .then((j) => {
        if (cancelled) return;
        if (j.error) throw new Error(j.error);
        setDaily(j.weather.daily);
        setHourly(j.weather.hourly.slice(0, 72));
      })
      .catch((e) => !cancelled && setError((e as Error).message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [plantId]);

  const plant = plants.find((p) => p.id === plantId);

  // Sólo mostramos días futuros (hoy excluido — ya no se puede agendar) y
  // limitamos a 5 para la vista. Se calculan lucro cesante y ranking.
  const { futureDays, maintenanceDay, worstDay, savingsCOP } = useMemo(() => {
    const today = startOfToday();
    const future = daily.filter((d) => parseLocalDate(d.date).getTime() > today.getTime()).slice(0, 5);
    if (future.length === 0) {
      return { futureDays: [], maintenanceDay: null, worstDay: null, savingsCOP: 0 };
    }
    const sorted = [...future].sort((a, b) => a.expectedKwhDay - b.expectedKwhDay);
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];
    const saves = Math.max(0, (worst.expectedKwhDay - best.expectedKwhDay) * TARIFF_COP_PER_KWH);
    return { futureDays: future, maintenanceDay: best, worstDay: worst, savingsCOP: saves };
  }, [daily]);

  const next5DayKwh = futureDays.reduce((s, d) => s + d.expectedKwhDay, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div>
          <label className="block text-xs font-medium uppercase text-slate-500">Planta</label>
          <select
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
            className="mt-1 w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {plant ? (
          <div className="text-xs text-slate-500">
            Capacidad instalada: <b className="text-slate-900">{plant.capacityKwp} kWp</b>
          </div>
        ) : null}
        {loading ? <span className="text-xs text-sky-600">Cargando…</span> : null}
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-5">
          <div className="text-xs font-semibold uppercase text-sky-700">Generación esperada (próximos días)</div>
          <div className="mt-2 font-heading text-3xl font-bold text-slate-900">
            {(next5DayKwh / 1000).toFixed(2)} <span className="text-sm text-slate-500">MWh</span>
          </div>
          <div className="text-xs text-slate-500">
            {futureDays.length > 0
              ? `${futureDays.length} día${futureDays.length === 1 ? "" : "s"} de pronóstico hacia adelante`
              : "Sin pronóstico disponible"}
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase text-amber-700">Mejor día para mantenimiento</div>
            <button
              type="button"
              onClick={() => setShowMethod((v) => !v)}
              className="flex items-center gap-1 rounded-full border border-amber-200 bg-white px-2 py-0.5 text-[11px] font-medium text-amber-700 transition hover:bg-amber-100"
              title="¿Cómo se calcula?"
            >
              <Info className="h-3 w-3" />
              {showMethod ? "Ocultar" : "¿Cómo?"}
            </button>
          </div>
          <div className="mt-2 font-heading text-lg font-bold text-slate-900">
            {maintenanceDay
              ? formatLocal(maintenanceDay.date, { weekday: "short", day: "numeric", month: "short" })
              : "—"}
          </div>
          <div className="text-xs text-slate-500">
            {maintenanceDay
              ? `Pronóstico: ${maintenanceDay.expectedKwhDay.toFixed(0)} kWh · lucro cesante ${formatCOP(
                  maintenanceDay.expectedKwhDay * TARIFF_COP_PER_KWH,
                )}`
              : "Necesitamos pronóstico futuro para recomendar"}
          </div>
          {maintenanceDay && worstDay && savingsCOP > 0 ? (
            <div className="mt-1 text-[11px] text-amber-800">
              Ahorro vs. peor día ({formatLocal(worstDay.date, { weekday: "short", day: "numeric" })}):{" "}
              <b>{formatCOP(savingsCOP)}</b>
            </div>
          ) : null}
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-semibold uppercase text-emerald-700">Ingreso esperado (próximos días)</div>
          <div className="mt-2 font-heading text-3xl font-bold text-slate-900">
            {formatCOP(next5DayKwh * TARIFF_COP_PER_KWH)}
          </div>
          <div className="text-xs text-slate-500">Tarifa promedio COP {TARIFF_COP_PER_KWH}/kWh</div>
        </div>
      </div>

      {showMethod ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50/60 p-5 text-sm text-slate-700">
          <div className="mb-2 flex items-center gap-2 font-semibold text-amber-800">
            <Info className="h-4 w-4" /> Cómo elegimos el día de mantenimiento
          </div>
          <ol className="list-decimal space-y-1 pl-5">
            <li>
              Traemos el pronóstico horario de Open-Meteo (irradiancia GHI W/m², nubosidad,
              temperatura) para la lat/lng de la planta, zona horaria <code>America/Bogota</code>.
            </li>
            <li>
              Energía esperada por día ={" "}
              <code>GHI<sub>diario</sub> (kWh/m²) × capacidad instalada (kWp) × PR 0.80</code>.
              El PR 0.80 asume pérdidas típicas (cables, inversor, suciedad, temperatura).
            </li>
            <li>
              Descartamos días pasados y el día de hoy (no sirve para planear una visita).
            </li>
            <li>
              Ordenamos los días restantes ascendente por kWh esperados. El{" "}
              <b>menor kWh</b> = menor <b>lucro cesante</b> (kWh × tarifa COP/kWh) = mejor
              candidato.
            </li>
            <li>
              Mostramos el ahorro vs. ejecutar ese mismo mantenimiento en el peor día del
              pronóstico para dimensionar la decisión.
            </li>
          </ol>
          <div className="mt-2 text-[11px] text-slate-500">
            Supuestos actuales: tarifa COP {TARIFF_COP_PER_KWH}/kWh fija, PR 0.80, ventana 5 días.
            No considera disponibilidad de cuadrilla, clima de riesgo (lluvia fuerte) ni OT
            programadas — esa capa se ensamblará con la vista de Órdenes de Trabajo.
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-heading text-base font-semibold">Energía esperada por día</h2>
          {maintenanceDay ? (
            <span className="text-[11px] text-amber-700">
              Barra resaltada = día recomendado
            </span>
          ) : null}
        </div>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={futureDays}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => formatLocal(d, { weekday: "short", day: "numeric" })}
                fontSize={11}
              />
              <YAxis fontSize={11} />
              <Tooltip
                formatter={(v: number) => `${v.toFixed(0)} kWh`}
                labelFormatter={(d: string) =>
                  formatLocal(d, { weekday: "long", day: "numeric", month: "long" })
                }
              />
              <Bar dataKey="expectedKwhDay" radius={[6, 6, 0, 0]}>
                {futureDays.map((d) => (
                  <Cell
                    key={d.date}
                    fill={maintenanceDay && d.date === maintenanceDay.date ? "#F59E0B" : "#0EA5E9"}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 font-heading text-base font-semibold">Curva horaria (72h)</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <AreaChart data={hourly}>
              <defs>
                <linearGradient id="gGen" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#0EA5E9" stopOpacity={0.5} />
                  <stop offset="95%" stopColor="#0EA5E9" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="ts"
                tickFormatter={(t: string) =>
                  new Date(t).toLocaleTimeString("es-CO", { hour: "2-digit" })
                }
                fontSize={10}
                minTickGap={40}
              />
              <YAxis fontSize={11} />
              <Tooltip
                formatter={(v: number, name: string) => [
                  name === "expectedKwAc" ? `${v.toFixed(1)} kW` : `${v.toFixed(0)}%`,
                  name === "expectedKwAc" ? "Generación" : "Nubosidad",
                ]}
                labelFormatter={(t: string) => new Date(t).toLocaleString("es-CO")}
              />
              <Area type="monotone" dataKey="expectedKwAc" stroke="#0EA5E9" fill="url(#gGen)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}
