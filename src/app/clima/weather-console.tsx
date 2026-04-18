"use client";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Plant = { id: string; label: string; client: string; capacityKwp: number };
type DailyRow = { date: string; ghiKwhM2: number; expectedKwhDay: number; sunriseLocal: string; sunsetLocal: string };
type HourlyRow = { ts: string; cloudCoverPct: number; ghiWm2: number; tempC: number; expectedKwAc: number };

export function WeatherConsole({ plants }: { plants: Plant[] }) {
  const [plantId, setPlantId] = useState(plants[0]?.id ?? "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daily, setDaily] = useState<DailyRow[]>([]);
  const [hourly, setHourly] = useState<HourlyRow[]>([]);

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
  const next5DayKwh = daily.slice(0, 5).reduce((s, d) => s + d.expectedKwhDay, 0);
  const maintenanceDay = daily
    .slice(0, 5)
    .reduce((min, d) => (d.expectedKwhDay < min.expectedKwhDay ? d : min), daily[0] ?? { expectedKwhDay: Infinity });

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
          <div className="text-xs font-semibold uppercase text-sky-700">Generación esperada (5 días)</div>
          <div className="mt-2 font-heading text-3xl font-bold text-slate-900">
            {(next5DayKwh / 1000).toFixed(2)} <span className="text-sm text-slate-500">MWh</span>
          </div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <div className="text-xs font-semibold uppercase text-amber-700">Mejor día para mantenimiento</div>
          <div className="mt-2 font-heading text-lg font-bold text-slate-900">
            {maintenanceDay?.date
              ? new Date(maintenanceDay.date).toLocaleDateString("es-CO", {
                  weekday: "short",
                  day: "numeric",
                  month: "short",
                })
              : "—"}
          </div>
          <div className="text-xs text-slate-500">
            Pronóstico: {maintenanceDay?.expectedKwhDay?.toFixed(0) ?? "—"} kWh (lucro cesante menor)
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-5">
          <div className="text-xs font-semibold uppercase text-emerald-700">Ahorro esperado (5 días)</div>
          <div className="mt-2 font-heading text-3xl font-bold text-slate-900">
            ${Math.round(next5DayKwh * 680).toLocaleString("es-CO")}
          </div>
          <div className="text-xs text-slate-500">Tarifa promedio COP 680/kWh</div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="mb-2 font-heading text-base font-semibold">Energía esperada por día</h2>
        <div className="h-64">
          <ResponsiveContainer>
            <BarChart data={daily.slice(0, 5)}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) =>
                  new Date(d).toLocaleDateString("es-CO", { weekday: "short", day: "numeric" })
                }
                fontSize={11}
              />
              <YAxis fontSize={11} />
              <Tooltip
                formatter={(v: number) => `${v.toFixed(0)} kWh`}
                labelFormatter={(d: string) =>
                  new Date(d).toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" })
                }
              />
              <Bar dataKey="expectedKwhDay" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
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
