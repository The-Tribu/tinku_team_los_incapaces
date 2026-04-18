"use client";

import {
  Area,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type GenerationPoint = {
  ts: string;
  label: string;
  actual: number | null;
  baseline: number | null;
};

/**
 * Chart "Generacion vs baseline" para el detalle de planta. Usa la serie
 * (actual | baseline) precalculada en el server y la pinta con recharts para
 * consistencia visual con el resto del panel.
 */
export function GenerationVsBaseline({
  data,
  height = 260,
}: {
  data: GenerationPoint[];
  height?: number;
}) {
  if (data.length === 0) {
    return (
      <div
        className="flex items-center justify-center text-sm text-slate-400"
        style={{ height }}
      >
        Sin lecturas recientes para comparar con el baseline.
      </div>
    );
  }
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
          <defs>
            <linearGradient id="plantBaselineFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            minTickGap={32}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#64748b" }}
            tickLine={false}
            axisLine={false}
            width={42}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 10,
              border: "1px solid #e2e8f0",
              fontSize: 12,
              boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
            }}
            formatter={(value: number, name: string) => {
              const label = name === "actual" ? "Real" : "Baseline";
              return [`${value.toFixed(1)} kW`, label];
            }}
            labelStyle={{ color: "#0f172a", fontWeight: 600 }}
          />
          <Legend
            wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
            iconType="circle"
            formatter={(val) => (
              <span className="text-slate-600">
                {val === "actual" ? "Generacion real" : "Baseline"}
              </span>
            )}
          />
          <Area
            type="monotone"
            dataKey="baseline"
            stroke="#94a3b8"
            strokeDasharray="4 3"
            strokeWidth={1.6}
            fill="url(#plantBaselineFill)"
            name="baseline"
            isAnimationActive={false}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="actual"
            stroke="#16a34a"
            strokeWidth={2.4}
            dot={false}
            activeDot={{ r: 4 }}
            name="actual"
            isAnimationActive={false}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
