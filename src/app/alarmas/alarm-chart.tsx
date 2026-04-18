"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AlarmReadingPoint } from "./alarms-center";

type Props = {
  data: AlarmReadingPoint[];
};

export function AlarmChart({ data }: Props) {
  const flat = data.map((p) => ({
    time: new Date(p.ts).toLocaleTimeString("es-CO", {
      hour: "2-digit",
      minute: "2-digit",
    }),
    day: new Date(p.ts).toLocaleDateString("es-CO", {
      day: "2-digit",
      month: "short",
    }),
    powerKw: p.powerKw ?? 0,
    voltageV: p.voltageV ?? 0,
    temperatureC: p.temperatureC ?? 0,
  }));

  if (flat.length === 0) {
    return (
      <div className="flex h-36 w-full items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 text-xs text-slate-500">
        Sin lecturas recientes para este dispositivo.
      </div>
    );
  }

  return (
    <div className="h-36 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={flat} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="alarm-power" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#16A34A" stopOpacity={0.35} />
              <stop offset="95%" stopColor="#16A34A" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="time"
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            minTickGap={24}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#94a3b8" }}
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e2e8f0",
              fontSize: 11,
              padding: "4px 8px",
            }}
            formatter={(v: number) => [`${v.toFixed(2)} kW`, "Potencia"]}
            labelFormatter={(label: string) => label}
          />
          <Area
            type="monotone"
            dataKey="powerKw"
            stroke="#16A34A"
            strokeWidth={2}
            fill="url(#alarm-power)"
            name="Potencia"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
