"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CloudRain,
  CloudSun,
  Info,
  Thermometer,
  TrendingDown,
  Zap,
} from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { BrandChip } from "@/components/sunhub/brand-chip";
import { FleetMap } from "@/components/sunhub/fleet-map";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { SectionCard } from "@/components/sunhub/section-card";

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

// === Alertas operativas (24-72h) — derivadas de los datos horarios ===
type OpsAlert = {
  id: string;
  kind: "tormenta" | "lluvia" | "nube";
  title: string;
  region: string;
  windowLabel: string;
  impact: string;
};

function deriveAlerts(hourly: HourlyRow[]): OpsAlert[] {
  if (hourly.length === 0) return [];
  const alerts: OpsAlert[] = [];
  const within72 = hourly.slice(0, 72);
  const avgCloud = within72.reduce((s, h) => s + h.cloudCoverPct, 0) / within72.length;
  const maxCloud = within72.reduce((a, b) => (a.cloudCoverPct > b.cloudCoverPct ? a : b));
  const lowGen = within72.filter((h) => h.expectedKwAc < 0.05 && /\d{2}:00$/.test(h.ts)).length;

  if (maxCloud.cloudCoverPct > 90) {
    const d = new Date(maxCloud.ts);
    alerts.push({
      id: "storm",
      kind: "tormenta",
      title: "Tormenta eléctrica",
      region: "Antioquia · Cundinamarca",
      windowLabel: d.toLocaleString("es-CO", { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      impact: "Aislar inversores expuestos · verificar SPDs",
    });
  }
  if (avgCloud > 70) {
    alerts.push({
      id: "rain",
      kind: "lluvia",
      title: "Lluvia moderada prolongada",
      region: "Atlántico · Valle del Cauca",
      windowLabel: "24-48 h",
      impact: `~${Math.round(avgCloud)}% cobertura · reprogramar mantenimiento`,
    });
  }
  if (lowGen > 6) {
    alerts.push({
      id: "cloud",
      kind: "nube",
      title: "Ventana baja radiación",
      region: "Tolima · Huila",
      windowLabel: "48-72 h",
      impact: `${lowGen} horas con generación esperada < 5%`,
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: "ok",
      kind: "nube",
      title: "Sin eventos críticos",
      region: "Flota nacional",
      windowLabel: "próximas 72 h",
      impact: "Condiciones estables · mantenimiento preventivo habilitado",
    });
  }
  return alerts;
}

const ALERT_STYLES: Record<OpsAlert["kind"], { border: string; bg: string; text: string; icon: React.ReactNode }> = {
  tormenta: { border: "border-red-200", bg: "bg-red-50", text: "text-red-700", icon: <CloudRain className="h-4 w-4" /> },
  lluvia: { border: "border-amber-200", bg: "bg-amber-50", text: "text-amber-700", icon: <CloudRain className="h-4 w-4" /> },
  nube: { border: "border-sky-200", bg: "bg-sky-50", text: "text-sky-700", icon: <CloudSun className="h-4 w-4" /> },
};

// Marcas simuladas para el widget "Impacto por marca"
const BRAND_IMPACT = [
  { slug: "growatt", delta: -9 },
  { slug: "huawei", delta: -12 },
  { slug: "deye", delta: -11 },
  { slug: "hoymiles", delta: -15 },
  { slug: "srne", delta: -13 },
];

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

  // === KPIs nacionales (estimados) ===
  const fleetKpis = useMemo(() => {
    const nextCloud = hourly.slice(0, 24);
    const avgCloud = nextCloud.length
      ? nextCloud.reduce((s, h) => s + h.cloudCoverPct, 0) / nextCloud.length
      : 0;
    const avgTemp = nextCloud.length
      ? nextCloud.reduce((s, h) => s + h.tempC, 0) / nextCloud.length
      : 0;
    const plantsUnderClouds = Math.round((avgCloud / 100) * 218);
    const expectedMwh = futureDays.reduce((s, d) => s + d.expectedKwhDay, 0) / 1000;
    const rainAlerts = hourly.filter((h) => h.cloudCoverPct > 80).length > 24 ? 3 : hourly.filter((h) => h.cloudCoverPct > 80).length > 8 ? 2 : 1;
    return { plantsUnderClouds, expectedMwh, rainAlerts, avgTemp };
  }, [hourly, futureDays]);

  // === Serie 7 días para el gráfico de impacto proyectado ===
  const impact7d = useMemo(() => {
    if (futureDays.length === 0) return [] as Array<{ date: string; esperada: number; climatica: number }>;
    return futureDays.map((d) => {
      const base = d.expectedKwhDay;
      // "climatica" = proyección ajustada según nubosidad promedio de ese día
      const dayHours = hourly.filter((h) => h.ts.startsWith(d.date));
      const avgCloud = dayHours.length ? dayHours.reduce((s, h) => s + h.cloudCoverPct, 0) / dayHours.length : 0;
      const factor = Math.max(0.5, 1 - avgCloud / 180); // suaviza el impacto
      return {
        date: d.date,
        esperada: Math.round(base),
        climatica: Math.round(base * factor),
      };
    });
  }, [futureDays, hourly]);

  const alerts = useMemo(() => deriveAlerts(hourly), [hourly]);

  return (
    <div className="space-y-6">
      {/* === Barra superior: selector planta + contexto === */}
      <div className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div>
          <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Planta de referencia
          </label>
          <select
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
            className="mt-1 w-72 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </div>
        {plant ? (
          <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-600">
            Capacidad instalada: <b className="text-slate-900">{plant.capacityKwp} kWp</b>
          </div>
        ) : null}
        <div className="ml-auto flex items-center gap-2">
          {loading ? <span className="text-xs text-sky-600">Sincronizando…</span> : null}
          {error ? <span className="text-xs text-red-600">{error}</span> : null}
          <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-[11px] font-medium text-sky-700">
            Open-Meteo · zona America/Bogota
          </span>
        </div>
      </div>

      {/* === 4 KPIs === */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Plantas bajo nubosidad"
          value={fleetKpis.plantsUnderClouds}
          unit="/ 218"
          tone="info"
          icon={<CloudSun className="h-4 w-4" />}
          hint="Cobertura promedio próximas 24 h"
        />
        <KpiCard
          label="Generación proyectada"
          value={fleetKpis.expectedMwh.toFixed(1)}
          unit="MWh"
          tone="primary"
          icon={<Zap className="h-4 w-4" />}
          hint={`Próximos ${futureDays.length} días`}
        />
        <KpiCard
          label="Alertas lluvia"
          value={fleetKpis.rainAlerts}
          tone="warning"
          icon={<CloudRain className="h-4 w-4" />}
          hint="Severidad media"
        />
        <KpiCard
          label="Temperatura promedio"
          value={fleetKpis.avgTemp.toFixed(1)}
          unit="°C"
          tone="danger"
          icon={<Thermometer className="h-4 w-4" />}
          hint="Promedio flota 24 h"
        />
      </div>

      {/* === Mapa Colombia + Alertas operativas === */}
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Mapa climático de Colombia con plantas"
          subtitle="Pronóstico cruzado con ubicación de plantas"
          className="xl:col-span-2"
          bodyClassName="pt-0"
        >
          <FleetMap focusedId={plantId} />
        </SectionCard>

        <SectionCard
          title="Alertas operativas (24-72h)"
          subtitle="Ordenadas por severidad y ventana"
          actions={
            <button className="text-[11px] font-medium text-emerald-700 hover:underline">Ver todas</button>
          }
          bodyClassName="space-y-2"
        >
          {alerts.map((a) => {
            const s = ALERT_STYLES[a.kind];
            return (
              <div
                key={a.id}
                className={`rounded-xl border ${s.border} ${s.bg} p-3`}
              >
                <div className={`flex items-center gap-2 text-sm font-semibold ${s.text}`}>
                  {s.icon}
                  {a.title}
                </div>
                <div className="mt-1 text-xs text-slate-700">{a.region}</div>
                <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                  <span>{a.windowLabel}</span>
                  <span className="font-medium text-slate-700">{a.impact}</span>
                </div>
              </div>
            );
          })}
        </SectionCard>
      </div>

      {/* === Impacto proyectado 7 días (barras) === */}
      <SectionCard
        title="Impacto proyectado 7 días"
        subtitle="Generación esperada vs. proyección climática"
        actions={
          <button
            type="button"
            onClick={() => setShowMethod((v) => !v)}
            className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white px-2.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-emerald-300 hover:text-emerald-700"
            title="¿Cómo se calcula?"
          >
            <Info className="h-3 w-3" />
            {showMethod ? "Ocultar método" : "¿Cómo?"}
          </button>
        }
      >
        <div className="h-72">
          <ResponsiveContainer>
            <BarChart data={impact7d} barGap={8}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="date"
                tickFormatter={(d: string) => formatLocal(d, { weekday: "short", day: "numeric" })}
                fontSize={11}
                stroke="#94a3b8"
              />
              <YAxis fontSize={11} stroke="#94a3b8" />
              <Tooltip
                formatter={(v: number) => `${v.toLocaleString("es-CO")} kWh`}
                labelFormatter={(d: string) => formatLocal(d, { weekday: "long", day: "numeric", month: "long" })}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="esperada" name="Generación esperada" radius={[6, 6, 0, 0]}>
                {impact7d.map((d) => (
                  <Cell key={`e-${d.date}`} fill="#0ea5e9" />
                ))}
              </Bar>
              <Bar dataKey="climatica" name="Proyección climática" radius={[6, 6, 0, 0]}>
                {impact7d.map((d) => (
                  <Cell key={`c-${d.date}`} fill="#16a34a" />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        {showMethod ? (
          <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4 text-xs text-slate-700">
            <div className="mb-1 flex items-center gap-2 font-semibold text-amber-800">
              <Info className="h-3.5 w-3.5" /> Cómo elegimos el día de mantenimiento
            </div>
            <ol className="list-decimal space-y-1 pl-5">
              <li>Pronóstico horario Open-Meteo (GHI W/m², nubosidad, temperatura) por lat/lng.</li>
              <li>
                Energía esperada = GHI diario × capacidad (kWp) × PR 0.80 (pérdidas típicas).
              </li>
              <li>Descartamos días pasados y hoy (no sirven para agendar visita).</li>
              <li>Ordenamos ascendente por kWh · menor kWh = menor lucro cesante.</li>
              <li>Tarifa COP {TARIFF_COP_PER_KWH}/kWh fija. Ventana: {futureDays.length} días.</li>
            </ol>
            {maintenanceDay && worstDay && savingsCOP > 0 ? (
              <div className="mt-2 text-amber-800">
                Mejor día para mantenimiento:{" "}
                <b>{formatLocal(maintenanceDay.date, { weekday: "long", day: "numeric", month: "long" })}</b>
                · Ahorro vs. peor día: <b>{formatCOP(savingsCOP)}</b>
              </div>
            ) : null}
          </div>
        ) : null}
      </SectionCard>

      {/* === Curva horaria 72h (línea) === */}
      <SectionCard
        title="Curva horaria 72 h"
        subtitle="Generación AC esperada por hora (planta seleccionada)"
      >
        <div className="h-56">
          <ResponsiveContainer>
            <LineChart data={hourly}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" vertical={false} />
              <XAxis
                dataKey="ts"
                tickFormatter={(t: string) => new Date(t).toLocaleTimeString("es-CO", { hour: "2-digit" })}
                fontSize={10}
                minTickGap={40}
                stroke="#94a3b8"
              />
              <YAxis fontSize={11} stroke="#94a3b8" />
              <Tooltip
                formatter={(v: number) => `${v.toFixed(1)} kW`}
                labelFormatter={(t: string) => new Date(t).toLocaleString("es-CO")}
                contentStyle={{ borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="expectedKwAc" stroke="#0ea5e9" strokeWidth={2} dot={false} name="Generación AC" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </SectionCard>

      {/* === Impacto por marca === */}
      <SectionCard
        title="Impacto por marca ante condiciones actuales"
        subtitle="Desviación de generación vs. baseline soleado (estimada)"
      >
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {BRAND_IMPACT.map((b) => (
            <div
              key={b.slug}
              className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-3"
            >
              <BrandChip slug={b.slug} />
              <div className="inline-flex items-center gap-1 text-sm font-semibold text-red-600">
                <TrendingDown className="h-3.5 w-3.5" /> {b.delta}%
              </div>
            </div>
          ))}
        </div>
      </SectionCard>
    </div>
  );
}
