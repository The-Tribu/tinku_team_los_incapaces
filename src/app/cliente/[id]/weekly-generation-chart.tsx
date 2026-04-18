"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { cn } from "@/lib/cn";

export type DailyPoint = {
  label: string;
  kwh: number;
};

type Props = {
  /** Serie completa de los últimos 30 días (más reciente al final). */
  data30: DailyPoint[];
  /** Generación de hoy (kWh). */
  todayKwh: number;
  /** Suma kWh de los últimos 7 días (precomputada). */
  total7: number;
  /** Suma kWh de los últimos 30 días (precomputada). */
  total30: number;
};

type Range = "today" | "7d" | "30d";

const RANGES: { id: Range; label: string }[] = [
  { id: "today", label: "Hoy" },
  { id: "7d", label: "7d" },
  { id: "30d", label: "30d" },
];

/**
 * Gráfico de generación semanal/mensual. Se mantiene aislado como client
 * component para poder usar recharts + selector interactivo sin romper el
 * server-rendering de la página.
 */
export function WeeklyGenerationChart({ data30, todayKwh, total7, total30 }: Props) {
  const [range, setRange] = useState<Range>("7d");

  const { series, total, caption } = useMemo(() => {
    if (range === "today") {
      const today = data30[data30.length - 1];
      return {
        series: today ? [today] : [],
        total: todayKwh,
        caption: "Hoy",
      };
    }
    if (range === "30d") {
      return { series: data30, total: total30, caption: "Últimos 30 días" };
    }
    const last7 = data30.slice(-7);
    return { series: last7, total: total7, caption: "Últimos 7 días" };
  }, [range, data30, todayKwh, total7, total30]);

  const max = Math.max(1, ...series.map((d) => d.kwh));

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="font-heading text-3xl font-bold text-slate-900">
            {Math.round(total).toLocaleString("es-CO")}{" "}
            <span className="text-base font-medium text-slate-500">kWh</span>
          </div>
          <div className="text-xs text-slate-500">{caption}</div>
        </div>
        <div className="inline-flex rounded-full bg-slate-100 p-1">
          {RANGES.map((r) => (
            <button
              key={r.id}
              type="button"
              onClick={() => setRange(r.id)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold transition",
                range === r.id
                  ? "bg-white text-emerald-700 shadow-sm"
                  : "text-slate-500 hover:text-slate-700",
              )}
            >
              {r.label}
            </button>
          ))}
        </div>
      </div>
      <div className="mt-3 h-40 w-full">
        {series.length === 0 ? (
          <div className="flex h-full items-center justify-center text-xs text-slate-400">
            Sin lecturas para este rango
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={series} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 10, fill: "#64748b" }}
                tickLine={false}
                axisLine={false}
                interval={0}
                minTickGap={4}
              />
              <YAxis
                tick={{ fontSize: 10, fill: "#94a3b8" }}
                tickLine={false}
                axisLine={false}
                width={40}
              />
              <Tooltip
                cursor={{ fill: "rgba(16, 185, 129, 0.08)" }}
                contentStyle={{
                  borderRadius: 10,
                  border: "1px solid #e2e8f0",
                  fontSize: 12,
                  boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
                }}
                formatter={(v: number) => [
                  `${Math.round(v).toLocaleString("es-CO")} kWh`,
                  "Generación",
                ]}
                labelStyle={{ color: "#0f172a", fontWeight: 600 }}
              />
              <Bar dataKey="kwh" radius={[6, 6, 0, 0]}>
                {series.map((d, i) => {
                  const isMax = d.kwh === max && max > 0;
                  return (
                    <Cell
                      key={`${d.label}-${i}`}
                      fill={isMax ? "#10b981" : "#a7f3d0"}
                    />
                  );
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
