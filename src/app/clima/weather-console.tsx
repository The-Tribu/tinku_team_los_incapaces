"use client";
import { useEffect, useMemo, useState } from "react";
import {
  CloudRain,
  CloudSun,
  Coins,
  Info,
  MinusCircle,
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

type Plant = {
  id: string;
  label: string;
  client: string;
  capacityKwp: number;
  location?: string | null;
  lat?: number | null;
  lng?: number | null;
};
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

function deriveAlerts(hourly: HourlyRow[], region: string): OpsAlert[] {
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
      region,
      windowLabel: d.toLocaleString("es-CO", { weekday: "short", hour: "2-digit", minute: "2-digit" }),
      impact: "Aislar inversores expuestos · verificar SPDs",
    });
  }
  if (avgCloud > 70) {
    alerts.push({
      id: "rain",
      kind: "lluvia",
      title: "Lluvia moderada prolongada",
      region,
      windowLabel: "24-48 h",
      impact: `~${Math.round(avgCloud)}% cobertura · reprogramar mantenimiento`,
    });
  }
  if (lowGen > 6) {
    alerts.push({
      id: "cloud",
      kind: "nube",
      title: "Ventana baja radiación",
      region,
      windowLabel: "48-72 h",
      impact: `${lowGen} horas con generación esperada < 5%`,
    });
  }
  if (alerts.length === 0) {
    alerts.push({
      id: "ok",
      kind: "nube",
      title: "Sin eventos críticos",
      region,
      windowLabel: "próximas 72 h",
      impact: "Condiciones estables · mantenimiento preventivo habilitado",
    });
  }
  return alerts;
}

// Resuelve una etiqueta de región legible a partir del plant. Preferimos
// el `location` que viene de la BD (ya es "Cali, Valle del Cauca" o similar);
// si no existe, aproximamos el departamento por lat/lng usando rangos coarse.
function resolveRegion(plant: Plant | undefined): string {
  if (!plant) return "Zona del proyecto";
  if (plant.location && plant.location.trim()) return plant.location.trim();
  const lat = plant.lat;
  const lng = plant.lng;
  if (lat == null || lng == null) return "Colombia";
  // Rangos aproximados por departamento/región natural (suficiente para un
  // encabezado informativo — el forecast real ya se calcula sobre lat/lng).
  if (lat > 11) return "La Guajira";
  if (lat > 9 && lng > -74) return "Costa Atlántica";
  if (lat > 7 && lng < -76.5) return "Chocó · Pacífico";
  if (lat > 6.5 && lng > -75 && lng < -73) return "Santander";
  if (lat > 5.7 && lng > -76 && lng < -74.5) return "Antioquia";
  if (lat > 4.3 && lat < 5.2 && lng > -74.5 && lng < -73.7) return "Cundinamarca · Bogotá";
  if (lat > 3 && lat < 5.3 && lng > -77 && lng < -75.5) return "Valle del Cauca";
  if (lat > 2.3 && lat < 3.3 && lng > -78 && lng < -76) return "Cauca · Nariño";
  if (lat > 3.5 && lat < 5.2 && lng > -76 && lng < -74.5) return "Tolima · Huila";
  if (lat > 4 && lng > -73 && lng < -69) return "Llanos Orientales";
  return "Zona del proyecto";
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

  const region = useMemo(() => resolveRegion(plant), [plant]);
  const alerts = useMemo(() => deriveAlerts(hourly, region), [hourly, region]);

  // === Degradación por nubosidad (card nueva) ===
  // Usamos el pronóstico horario del día de hoy + 24 h: convertimos la
  // nubosidad promedio en un factor de pérdida sobre capacidad instalada.
  // Formula heurística: loss% = clamp( avgCloud * 0.55, 0, 75 )
  // (las nubes cirrus pierden poco; nubes densas degradan hasta ~75%).
  const cloudDegradation = useMemo(() => {
    const cap = plant?.capacityKwp ?? 0;
    const within24 = hourly.slice(0, 24);
    if (within24.length === 0 || cap === 0) {
      return { avgCloudPct: 0, lossPct: 0, lostKwh: 0, lostCOP: 0, peakCloudPct: 0 };
    }
    const avgCloudPct = within24.reduce((s, h) => s + h.cloudCoverPct, 0) / within24.length;
    const peakCloudPct = within24.reduce((m, h) => Math.max(m, h.cloudCoverPct), 0);
    const lossPct = Math.max(0, Math.min(75, avgCloudPct * 0.55));
    // Energía solar potencial en 24 h con baseline soleado (PR 0.80, 4.5 h equivalentes):
    const baselineKwh = cap * 4.5 * 0.8;
    const lostKwh = (baselineKwh * lossPct) / 100;
    const lostCOP = lostKwh * TARIFF_COP_PER_KWH;
    return { avgCloudPct, lossPct, lostKwh, lostCOP, peakCloudPct };
  }, [hourly, plant]);

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

      {/* === Degradación por nubosidad · planta seleccionada === */}
      <SectionCard
        title="Degradación por nubosidad"
        subtitle={`Pérdida estimada en generación para ${plant?.label ?? "la planta seleccionada"} · próximas 24 h`}
        actions={
          <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">
            <MinusCircle className="h-3 w-3" />
            Capacidad {plant?.capacityKwp ?? 0} kWp
          </span>
        }
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-sky-700">
              Nubosidad promedio
            </div>
            <div className="mt-1 flex items-baseline gap-1 font-heading text-2xl font-semibold text-sky-900">
              {cloudDegradation.avgCloudPct.toFixed(0)}
              <span className="text-sm font-normal text-sky-700">%</span>
            </div>
            <div className="text-[11px] text-sky-700/80">
              Pico {cloudDegradation.peakCloudPct.toFixed(0)}%
            </div>
          </div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-amber-800">
              Pérdida esperada
            </div>
            <div className="mt-1 flex items-baseline gap-1 font-heading text-2xl font-semibold text-amber-900">
              {cloudDegradation.lossPct.toFixed(1)}
              <span className="text-sm font-normal text-amber-800">%</span>
            </div>
            <div className="text-[11px] text-amber-800/80">
              vs. baseline soleado
            </div>
          </div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/70 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-rose-700">
              Energía no generada
            </div>
            <div className="mt-1 flex items-baseline gap-1 font-heading text-2xl font-semibold text-rose-900">
              {cloudDegradation.lostKwh.toFixed(1)}
              <span className="text-sm font-normal text-rose-700">kWh</span>
            </div>
            <div className="text-[11px] text-rose-700/80">
              24 h con condiciones actuales
            </div>
          </div>
          <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-800">
              Lucro cesante
            </div>
            <div className="mt-1 flex items-baseline gap-1 font-heading text-2xl font-semibold text-emerald-900">
              {formatCOP(cloudDegradation.lostCOP)}
            </div>
            <div className="inline-flex items-center gap-1 text-[11px] text-emerald-800/80">
              <Coins className="h-3 w-3" />
              tarifa {TARIFF_COP_PER_KWH} COP/kWh
            </div>
          </div>
        </div>
        <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-gradient-to-r from-sky-400 via-amber-400 to-rose-500"
            style={{ width: `${Math.min(100, cloudDegradation.lossPct)}%` }}
          />
        </div>
        <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
          <span>0% (cielo despejado)</span>
          <span>75% (nubosidad máxima)</span>
        </div>
      </SectionCard>

      {/* === Mapa Colombia + Alertas operativas === */}
      <div className="grid gap-4 xl:grid-cols-3">
        <SectionCard
          title="Mapa climático de Colombia con plantas"
          subtitle="Haz clic en un punto del mapa para cambiar la planta de referencia"
          className="xl:col-span-2"
          bodyClassName="pt-0"
        >
          <FleetMap
            focusedId={plantId}
            onSelectPlant={(id) => setPlantId(id)}
            heightClass="h-[24rem]"
          />
        </SectionCard>

        <SectionCard
          title="Alertas operativas (24-72h)"
          subtitle={`Región: ${region}`}
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
