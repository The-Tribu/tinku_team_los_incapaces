"use client";
import { useEffect, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { ts: string; power_kw: number; by_provider: Record<string, number> };

const PROVIDER_COLORS: Record<string, string> = {
  growatt: "#16A34A",
  deye: "#0EA5E9",
  huawei: "#FACC15",
  hoymiles: "#8B5CF6",
  srne: "#F59E0B",
  solarman: "#DC2626",
};

export function GenerationChart() {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      const res = await fetch("/api/fleet/generation-24h");
      const json = await res.json();
      if (!cancelled) {
        setData(json.series as Point[]);
        setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const providers = Array.from(
    new Set(data.flatMap((p) => Object.keys(p.by_provider))),
  );
  const flat = data.map((p) => ({
    ts: p.ts,
    time: new Date(p.ts).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" }),
    ...p.by_provider,
  }));

  return (
    <div className="h-72 w-full">
      {loading ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Cargando generación…
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={flat} margin={{ top: 10, right: 12, left: -12, bottom: 0 }}>
            <defs>
              {providers.map((p) => (
                <linearGradient key={p} id={`g-${p}`} x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="5%"
                    stopColor={PROVIDER_COLORS[p] ?? "#16A34A"}
                    stopOpacity={0.4}
                  />
                  <stop
                    offset="95%"
                    stopColor={PROVIDER_COLORS[p] ?? "#16A34A"}
                    stopOpacity={0.02}
                  />
                </linearGradient>
              ))}
            </defs>
            <CartesianGrid stroke="#e2e8f0" strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="time" tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <YAxis tick={{ fontSize: 11, fill: "#64748b" }} tickLine={false} axisLine={false} />
            <Tooltip
              contentStyle={{
                borderRadius: 8,
                border: "1px solid #e2e8f0",
                fontSize: 12,
              }}
              formatter={(v: number) => `${(v as number).toFixed(1)} kW`}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            {providers.map((p) => (
              <Area
                key={p}
                type="monotone"
                dataKey={p}
                stackId="1"
                stroke={PROVIDER_COLORS[p] ?? "#16A34A"}
                strokeWidth={2}
                fill={`url(#g-${p})`}
                name={p[0].toUpperCase() + p.slice(1)}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
