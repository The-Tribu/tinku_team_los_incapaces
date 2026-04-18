"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = { ts: string; power_kw: number; by_provider: Record<string, number> };

const PROVIDER_COLORS: Record<string, string> = {
  growatt: "#16a34a",
  deye: "#0ea5e9",
  huawei: "#f59e0b",
  hoymiles: "#8b5cf6",
  srne: "#ef4444",
  solarman: "#6366f1",
};

const PROVIDER_LABEL: Record<string, string> = {
  growatt: "Growatt",
  deye: "Deye",
  huawei: "Huawei",
  hoymiles: "Hoymiles",
  srne: "SRNE",
  solarman: "Solarman",
};

type Props = {
  height?: number;
};

export function GenerationChart({ height = 280 }: Props) {
  const [data, setData] = useState<Point[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch("/api/fleet/generation-24h");
        const json = await res.json();
        if (!cancelled) {
          setData(json.series as Point[]);
          setLoading(false);
        }
      } catch {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    const id = setInterval(load, 60_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  const { providers, flat } = useMemo(() => {
    const set = new Set<string>();
    for (const p of data) for (const k of Object.keys(p.by_provider)) set.add(k);
    const providers = Array.from(set);
    const flat = data.map((p) => ({
      ts: p.ts,
      time: new Date(p.ts).toLocaleTimeString("es-CO", {
        hour: "2-digit",
        minute: "2-digit",
      }),
      ...p.by_provider,
    }));
    return { providers, flat };
  }, [data]);

  return (
    <div className="w-full" style={{ height }}>
      {loading ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Cargando generación…
        </div>
      ) : flat.length === 0 ? (
        <div className="flex h-full items-center justify-center text-sm text-slate-400">
          Sin lecturas recientes
        </div>
      ) : (
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={flat} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
            <CartesianGrid stroke="#eef2f7" strokeDasharray="3 3" vertical={false} />
            <XAxis
              dataKey="time"
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              minTickGap={28}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "#64748b" }}
              tickLine={false}
              axisLine={false}
              width={48}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 10,
                border: "1px solid #e2e8f0",
                fontSize: 12,
                boxShadow: "0 4px 16px rgba(15,23,42,0.06)",
              }}
              formatter={(v: number, name: string) => [
                `${(v as number).toFixed(1)} kW`,
                PROVIDER_LABEL[name] ?? name,
              ]}
              labelStyle={{ color: "#0f172a", fontWeight: 600 }}
            />
            <Legend
              wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
              iconType="circle"
              formatter={(val) => (
                <span className="text-slate-600">
                  {PROVIDER_LABEL[val] ?? val}
                </span>
              )}
            />
            {providers.map((p) => (
              <Line
                key={p}
                type="monotone"
                dataKey={p}
                stroke={PROVIDER_COLORS[p] ?? "#64748b"}
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
                name={p}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      )}
    </div>
  );
}
