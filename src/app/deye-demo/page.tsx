"use client";

import { useEffect, useRef, useState } from "react";
import { DEMO_STATIONS, simulateReading, type DeyeDemoReading } from "@/lib/deye-sim";

// Configurable via .env (NEXT_PUBLIC_* so they're available in the browser)
// NEXT_PUBLIC_DEYE_DEMO_TICK_MS  — real-time ms between UI updates (default 1000)
// NEXT_PUBLIC_DEYE_DEMO_SIM_STEP_S — simulated seconds advanced per tick (default 30)
const TICK_MS = Number(process.env.NEXT_PUBLIC_DEYE_DEMO_TICK_MS ?? 1000);
const SIM_STEP_S = Number(process.env.NEXT_PUBLIC_DEYE_DEMO_SIM_STEP_S ?? 30);

// ── Chart ─────────────────────────────────────────────────────────────────────

function PowerChart({ history }: { history: number[] }) {
  const W = 560;
  const H = 100;
  if (history.length < 2) return <div style={{ height: H }} />;
  const max = Math.max(...history, 1);
  const pts = history
    .map((v, i) => {
      const x = (i / (history.length - 1)) * W;
      const y = H - (v / max) * (H - 8);
      return `${x},${y}`;
    })
    .join(" ");
  const fill = `${pts} ${W},${H} 0,${H}`;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: H }}>
      <defs>
        <linearGradient id="chartGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#16A34A" stopOpacity="0.45" />
          <stop offset="100%" stopColor="#16A34A" stopOpacity="0.03" />
        </linearGradient>
      </defs>
      <polygon points={fill} fill="url(#chartGrad)" />
      <polyline
        points={pts}
        fill="none"
        stroke="#16A34A"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Stat card ─────────────────────────────────────────────────────────────────

function Stat({
  label,
  value,
  unit,
  color = "text-white",
  sub,
  metric,
}: {
  label: string;
  value: string | number;
  unit?: string;
  color?: string;
  sub?: string;
  metric?: string; // data-metric attribute for scraper
}) {
  return (
    <div className="rounded-xl bg-[#1a2035] p-4 flex flex-col gap-1">
      <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
        {label}
      </span>
      <div className="flex items-baseline gap-1">
        <span
          className={`text-2xl font-bold font-mono ${color}`}
          {...(metric ? { "data-metric": metric } : {})}
        >
          {value}
        </span>
        {unit && <span className="text-sm text-slate-400">{unit}</span>}
      </div>
      {sub && <span className="text-xs text-slate-500">{sub}</span>}
    </div>
  );
}

// ── Battery bar ───────────────────────────────────────────────────────────────

function BatteryBar({ soc }: { soc: number }) {
  const color = soc > 60 ? "#16A34A" : soc > 30 ? "#F59E0B" : "#DC2626";
  return (
    <div className="rounded-xl bg-[#1a2035] p-4 flex flex-col gap-2">
      <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
        Batería SOC
      </span>
      <div className="flex items-center gap-3">
        <div className="flex-1 h-4 rounded-full bg-[#0d1424] overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700"
            style={{ width: `${soc}%`, backgroundColor: color }}
          />
        </div>
        <span
          className="text-lg font-bold font-mono"
          style={{ color }}
          data-metric="battery_soc_pct"
        >
          {soc.toFixed(0)}%
        </span>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function DeyeDemo() {
  const [plantIdx, setPlantIdx] = useState(0);
  const station = DEMO_STATIONS[plantIdx];

  // Simulated clock: advances 30s of sim-time per 1s real tick
  const simHourRef = useRef(8.5);
  const historyRef = useRef<number[]>([]);

  const buildMetrics = (wallMs = Date.now()): DeyeDemoReading =>
    simulateReading(station, simHourRef.current, wallMs);

  // seed=0 for initial render: SSR and client produce identical HTML.
  // The interval replaces these with live values after hydration.
  const [m, setM] = useState<DeyeDemoReading>(() =>
    simulateReading(station, simHourRef.current, 0)
  );
  const [fleet, setFleet] = useState<DeyeDemoReading[]>(() =>
    DEMO_STATIONS.map((s) => simulateReading(s, 8.5, 0))
  );

  // Push current reading to server so the scraper can read it
  const pushTickRef = useRef(0);
  const pushToServer = (reading: DeyeDemoReading) => {
    // Push every 5 ticks (~5s) to avoid flooding the server
    pushTickRef.current++;
    if (pushTickRef.current % 5 !== 0) return;
    fetch("/api/deye-demo/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(reading),
    }).catch(() => { /* fire and forget */ });
  };

  useEffect(() => {
    simHourRef.current = 8.5;
    pushTickRef.current = 0;
    historyRef.current = Array.from({ length: 60 }, (_, i) =>
      simulateReading(station, 8.5 + i / 120, Date.now()).power_ac_kw
    );

    // Push initial state immediately on mount
    const initial = buildMetrics();
    fetch("/api/deye-demo/state", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(initial),
    }).catch(() => {});

    const timer = setInterval(() => {
      simHourRef.current += SIM_STEP_S / 3600;
      if (simHourRef.current > 20) simHourRef.current = 6;

      const wallMs = Date.now();
      const next = buildMetrics(wallMs);
      historyRef.current = [...historyRef.current.slice(-119), next.power_ac_kw];
      setM(next);
      setFleet(DEMO_STATIONS.map((s) => simulateReading(s, simHourRef.current, wallMs)));
      pushToServer(next);
    }, TICK_MS);

    return () => clearInterval(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plantIdx]);

  const hourStr = `${String(Math.floor(simHourRef.current)).padStart(2, "0")}:${String(
    Math.round((simHourRef.current % 1) * 60),
  ).padStart(2, "0")}`;

  const statusColor = m.status === "online" ? "#16A34A" : m.status === "warning" ? "#F59E0B" : "#DC2626";
  const statusLabel = m.status.toUpperCase();

  return (
    <div
      className="min-h-screen font-sans"
      style={{ background: "#0d1424", color: "#e2e8f0" }}
      data-deye-snapshot={JSON.stringify(m)}
      suppressHydrationWarning
    >
      {/* ── Top bar ── */}
      <header
        className="flex items-center justify-between px-6 py-3 border-b"
        style={{ borderColor: "#1e2d45", background: "#111827" }}
      >
        <div className="flex items-center gap-3">
          <svg width="28" height="28" viewBox="0 0 28 28" fill="none">
            <circle cx="14" cy="14" r="13" fill="#16A34A" opacity="0.15" />
            <path
              d="M14 4 L17 11 H24 L18.5 15.5 L21 22 L14 18 L7 22 L9.5 15.5 L4 11 H11 Z"
              fill="#16A34A"
            />
          </svg>
          <span className="font-bold text-lg tracking-tight text-white">
            Deye<span className="text-[#16A34A]">Cloud</span>
            <span className="ml-2 text-xs font-normal text-slate-400">· SunHub Demo</span>
          </span>
        </div>

        {/* Plant selector */}
        <div className="flex items-center gap-2">
          {DEMO_STATIONS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setPlantIdx(i)}
              className="rounded-lg px-3 py-1.5 text-xs font-medium transition"
              style={{
                background: i === plantIdx ? "#16A34A22" : "transparent",
                color: i === plantIdx ? "#4ade80" : "#94a3b8",
                border: `1px solid ${i === plantIdx ? "#16A34A" : "#1e2d45"}`,
              }}
            >
              {s.name.split(" ").slice(0, 2).join(" ")}
            </button>
          ))}
        </div>

        {/* Sim clock */}
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <span
            className="inline-block w-2 h-2 rounded-full animate-pulse"
            style={{ background: statusColor }}
          />
          <span className="font-mono text-white font-semibold">{hourStr}</span>
          <span>sim</span>
        </div>
      </header>

      {/* ── Content ── */}
      <main className="max-w-5xl mx-auto px-4 py-6 space-y-6">

        {/* Plant header */}
        <div
          className="rounded-2xl p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{ background: "#111827", border: "1px solid #1e2d45" }}
          data-station-id={station.id}
        >
          <div>
            <div className="flex items-center gap-2">
              <span
                className="px-2 py-0.5 rounded text-xs font-bold"
                style={{ background: `${statusColor}22`, color: statusColor }}
                data-metric="status"
              >
                {statusLabel}
              </span>
              <span className="text-xs text-slate-500">{station.id}</span>
            </div>
            <h1 className="mt-1 text-2xl font-bold text-white font-heading">
              {station.name}
            </h1>
            <p className="text-sm text-slate-400 mt-0.5">
              Inversor híbrido · {station.peakKwp} kWp instalados · Colombia
            </p>
          </div>
          <div className="text-right">
            <p className="text-4xl font-bold font-mono text-[#4ade80]">
              <span data-metric="power_ac_kw">{m.power_ac_kw.toFixed(2)}</span>
              <span className="text-xl ml-1 text-slate-400">kW</span>
            </p>
            <p className="text-xs text-slate-500 mt-1">Potencia AC actual</p>
          </div>
        </div>

        {/* Energy flow */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat
            label="Generación hoy"
            value={m.energy_kwh.toFixed(1)}
            unit="kWh"
            color="text-yellow-300"
            metric="energy_kwh"
          />
          <Stat
            label="Total acumulado"
            value={(m.total_energy_kwh / 1000).toFixed(1)}
            unit="MWh"
            color="text-sky-300"
            metric="total_energy_kwh"
          />
          <Stat
            label="CO₂ evitado hoy"
            value={m.co2_today_kg.toFixed(2)}
            unit="kg"
            color="text-emerald-400"
            metric="co2_today_kg"
          />
          <Stat
            label="Irradiación"
            value={m.irradiation_wm2.toFixed(0)}
            unit="W/m²"
            color={m.status !== "offline" ? "text-yellow-200" : "text-slate-500"}
            sub={m.status !== "offline" ? "☀️ Alta" : "🌙 Noche"}
            metric="irradiation_wm2"
          />
        </div>

        {/* Chart */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#111827", border: "1px solid #1e2d45" }}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-semibold text-slate-300">
              Curva de potencia AC — últimos 2 min (sim)
            </span>
            <span className="text-xs text-slate-500 font-mono">
              máx {Math.max(...historyRef.current, 0).toFixed(2)} kW
            </span>
          </div>
          <PowerChart history={historyRef.current} />
          <div className="flex justify-between mt-1 text-xs text-slate-600">
            <span>−2 min</span>
            <span>ahora</span>
          </div>
        </div>

        {/* Grid & battery */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div
            className="rounded-2xl p-5 space-y-3"
            style={{ background: "#111827", border: "1px solid #1e2d45" }}
          >
            <h3 className="text-sm font-semibold text-slate-300">⚡ Red eléctrica</h3>
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Intercambio red"
                value={
                  m.grid_exchange_kw >= 0
                    ? `+${m.grid_exchange_kw.toFixed(2)}`
                    : m.grid_exchange_kw.toFixed(2)
                }
                unit="kW"
                color={m.grid_exchange_kw >= 0 ? "text-emerald-400" : "text-red-400"}
                sub={m.grid_exchange_kw >= 0 ? "Exportando" : "Importando"}
                metric="grid_exchange_kw"
              />
              <Stat
                label="Tensión red"
                value={m.voltage_v.toFixed(1)}
                unit="V"
                color="text-sky-300"
                metric="voltage_v"
              />
              <Stat
                label="Frecuencia"
                value={m.frequency_hz.toFixed(2)}
                unit="Hz"
                color="text-sky-300"
                metric="frequency_hz"
              />
              <Stat
                label="Factor de potencia"
                value={m.power_factor.toFixed(3)}
                color="text-violet-300"
                metric="power_factor"
              />
            </div>
          </div>

          <div
            className="rounded-2xl p-5 space-y-3"
            style={{ background: "#111827", border: "1px solid #1e2d45" }}
          >
            <h3 className="text-sm font-semibold text-slate-300">🔋 Almacenamiento + temperatura</h3>
            <BatteryBar soc={m.battery_soc_pct} />
            <div className="grid grid-cols-2 gap-2">
              <Stat
                label="Temp. inversor"
                value={m.temperature_c.toFixed(1)}
                unit="°C"
                color={m.temperature_c > 55 ? "text-red-400" : "text-orange-300"}
                sub={m.temperature_c > 55 ? "⚠ Alta" : "Normal"}
                metric="temperature_c"
              />
              <Stat
                label="PV DC total"
                value={m.power_pv_kw.toFixed(2)}
                unit="kW"
                color="text-yellow-300"
                metric="power_pv_kw"
              />
            </div>
          </div>
        </div>

        {/* String details */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#111827", border: "1px solid #1e2d45" }}
        >
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            🔌 Strings fotovoltaicos
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="String 1 — Tensión" value={m.string1_voltage_v.toFixed(1)} unit="V" color="text-yellow-200" metric="string1_voltage_v" />
            <Stat label="String 1 — Corriente" value={m.string1_current_a.toFixed(2)} unit="A" color="text-yellow-200" metric="string1_current_a" />
            <Stat label="String 2 — Tensión" value={m.string2_voltage_v.toFixed(1)} unit="V" color="text-amber-300" metric="string2_voltage_v" />
            <Stat label="String 2 — Corriente" value={m.string2_current_a.toFixed(2)} unit="A" color="text-amber-300" metric="string2_current_a" />
          </div>
          <p className="mt-3 text-xs text-slate-600">
            Corriente total:{" "}
            <span className="text-slate-400 font-mono" data-metric="current_a">
              {m.current_a.toFixed(2)} A
            </span>
            {"  "}· Eficiencia:{" "}
            <span className="text-slate-400 font-mono" data-metric="efficiency_pct">
              {m.efficiency_pct > 0 ? m.efficiency_pct.toFixed(1) : "—"}%
            </span>
          </p>
        </div>

        {/* Fleet mini-cards */}
        <div
          className="rounded-2xl p-5"
          style={{ background: "#111827", border: "1px solid #1e2d45" }}
        >
          <h3 className="text-sm font-semibold text-slate-300 mb-3">
            🏭 Flota — estado actual (demo)
          </h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {DEMO_STATIONS.map((s, i) => {
              const fc = fleet[i];
              const ok = fc.status === "online";
              return (
                <button
                  key={s.id}
                  onClick={() => setPlantIdx(i)}
                  className="rounded-xl p-3 text-left transition hover:brightness-110"
                  style={{
                    background: i === plantIdx ? "#16A34A18" : "#0d1424",
                    border: `1px solid ${i === plantIdx ? "#16A34A" : "#1e2d45"}`,
                  }}
                >
                  <div className="flex items-center gap-1.5 mb-1">
                    <span
                      className="w-1.5 h-1.5 rounded-full"
                      style={{ background: ok ? "#16A34A" : "#DC2626" }}
                    />
                    <span className="text-xs text-slate-400 truncate">
                      {s.name.split(" ").slice(0, 2).join(" ")}
                    </span>
                  </div>
                  <p className="font-mono font-bold text-sm text-white">
                    {fc.power_ac_kw.toFixed(2)} kW
                  </p>
                  <p className="text-xs text-slate-500">{s.peakKwp} kWp</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-slate-600 pb-4">
          Datos simulados · No conectado a API real · Actualización cada 1 s ·{" "}
          <span className="text-[#16A34A]">SunHub</span> — TINKU 2026 ·{" "}
          <a href="/api/deye-demo/DEMO-DEY-40760" className="underline hover:text-slate-400" target="_blank" rel="noreferrer">
            JSON endpoint
          </a>
        </p>
      </main>
    </div>
  );
}
