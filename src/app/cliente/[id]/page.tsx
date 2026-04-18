import { notFound } from "next/navigation";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronRight,
  CloudSun,
  Leaf,
  Sun,
  TrendingUp,
  Trophy,
  Wallet,
  Zap,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { Sparkline } from "@/components/sunhub/sparkline";
import { MetricBar } from "@/components/sunhub/metric-bar";
import { WeeklyGenerationChart, type DailyPoint } from "./weekly-generation-chart";
import { AssistantCard } from "./assistant-card";

export const dynamic = "force-dynamic";

// Tarifa promedio simplificada (COP/kWh) y factor de emisiones (ton/kWh)
const COP_PER_KWH = 680;
const CO2_TON_PER_KWH = 0.000164;

type DeviceStatus = "online" | "warning" | "offline" | "degraded" | "unknown";

function firstName(name: string | null | undefined) {
  if (!name) return "cliente";
  return name.trim().split(/\s+/)[0] ?? "cliente";
}

function shortClientCode(c: { id: string; region: string | null }) {
  // Un "código" estable y amigable: región (o CLI) + primeros 4 del UUID.
  const prefix = (c.region ?? "CLI").slice(0, 3).toUpperCase();
  const suffix = c.id.slice(0, 4).toUpperCase();
  return `${prefix} ${suffix}`;
}

function monthLabel(d: Date) {
  return d
    .toLocaleDateString("es-CO", { month: "long", year: "numeric" })
    .toUpperCase();
}

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, client] = await Promise.all([
    getSessionUser(),
    prisma.client.findUnique({
      where: { id },
      include: {
        plants: {
          include: {
            devices: {
              select: {
                id: true,
                currentStatus: true,
                lastSeenAt: true,
                provider: { select: { slug: true } },
              },
            },
            contracts: {
              orderBy: { periodMonth: "desc" },
              take: 1,
            },
          },
        },
      },
    }),
  ]);

  if (!client) notFound();

  const deviceIds = client.plants.flatMap((p) => p.devices.map((d) => d.id));
  const devices = client.plants.flatMap((p) => p.devices);
  const totalDevices = devices.length;
  const onlineDevices = devices.filter(
    (d) => (d.currentStatus as DeviceStatus) === "online",
  ).length;
  const warningDevices = devices.filter((d) => {
    const s = d.currentStatus as DeviceStatus;
    return s === "warning" || s === "degraded";
  }).length;
  const totalKwp = client.plants.reduce(
    (s, p) => s + Number(p.capacityKwp ?? 0),
    0,
  );
  const uptimePct =
    totalDevices > 0 ? (onlineDevices / totalDevices) * 100 : 0;

  // ── Series de tiempo ────────────────────────────────────────────
  // Hoy (potencia actual + energía hoy) y mes vigente.
  // La consulta diaria se usa para el gráfico de 30d / 7d / hoy.
  const [todayAgg, monthAgg, daily30, hourlyToday] = deviceIds.length
    ? await Promise.all([
        prisma.$queryRaw<Array<{ energy: number; power: number }>>`
          SELECT COALESCE(SUM(r.power_ac_kw), 0)::float AS power,
                 COALESCE(MAX(r.energy_kwh), 0)::float AS energy
          FROM readings r
          WHERE r.device_id = ANY(${deviceIds}::uuid[])
            AND r.ts >= date_trunc('day', now() at time zone 'America/Bogota')
        `,
        prisma.$queryRaw<Array<{ energy: number }>>`
          SELECT COALESCE(SUM(delta), 0)::float AS energy
          FROM (
            SELECT MAX(r.energy_kwh) - MIN(r.energy_kwh) AS delta
            FROM readings r
            WHERE r.device_id = ANY(${deviceIds}::uuid[])
              AND r.ts >= date_trunc('month', now() at time zone 'America/Bogota')
            GROUP BY r.device_id
          ) s
        `,
        prisma.$queryRaw<Array<{ day: Date; energy: number }>>`
          WITH days AS (
            SELECT generate_series(
              (now() at time zone 'America/Bogota')::date - INTERVAL '29 days',
              (now() at time zone 'America/Bogota')::date,
              INTERVAL '1 day'
            )::date AS day
          ),
          per_device AS (
            SELECT
              date_trunc('day', r.ts at time zone 'America/Bogota')::date AS day,
              r.device_id,
              MAX(r.energy_kwh) - MIN(r.energy_kwh) AS delta
            FROM readings r
            WHERE r.device_id = ANY(${deviceIds}::uuid[])
              AND r.ts >= (now() at time zone 'America/Bogota')::date - INTERVAL '30 days'
            GROUP BY 1, 2
          )
          SELECT d.day AS day,
                 COALESCE(SUM(p.delta), 0)::float AS energy
          FROM days d
          LEFT JOIN per_device p ON p.day = d.day
          GROUP BY d.day
          ORDER BY d.day ASC
        `,
        prisma.$queryRaw<Array<{ hour: Date; power: number }>>`
          SELECT date_trunc('hour', r.ts) AS hour,
                 COALESCE(AVG(r.power_ac_kw), 0)::float AS power
          FROM readings r
          WHERE r.device_id = ANY(${deviceIds}::uuid[])
            AND r.ts >= date_trunc('day', now() at time zone 'America/Bogota')
          GROUP BY 1
          ORDER BY 1 ASC
        `,
      ])
    : [
        [] as Array<{ energy: number; power: number }>,
        [] as Array<{ energy: number }>,
        [] as Array<{ day: Date; energy: number }>,
        [] as Array<{ hour: Date; power: number }>,
      ];

  const currentKw = todayAgg[0]?.power ?? 0;
  const todayKwh = todayAgg[0]?.energy ?? 0;
  const monthKwh = Math.max(0, monthAgg[0]?.energy ?? todayKwh * 30);
  const savingsCop = Math.round(monthKwh * COP_PER_KWH);
  const co2Ton = monthKwh * CO2_TON_PER_KWH;

  // Comparativo: promedio diario del mes vs hoy → delta %
  const now = new Date();
  const daysElapsed = Math.max(1, now.getDate());
  const avgDailyKwh = monthKwh / daysElapsed;
  const deltaPct =
    avgDailyKwh > 0 ? ((todayKwh - avgDailyKwh) / avgDailyKwh) * 100 : 0;

  // Chart data (últimos 30 días)
  const dayFormatter = new Intl.DateTimeFormat("es-CO", { weekday: "short" });
  const monthDayFormatter = new Intl.DateTimeFormat("es-CO", {
    month: "short",
    day: "2-digit",
  });
  const daily30Points: DailyPoint[] = daily30.map((row, i, arr) => {
    const d = new Date(row.day);
    // Para 7d usamos etiquetas cortas de día (lun, mar…); para 30d usamos nº.
    const isLast7 = i >= arr.length - 7;
    const label = isLast7
      ? dayFormatter.format(d).replace(".", "")
      : monthDayFormatter.format(d).replace(".", "");
    return { label, kwh: Number(row.energy) };
  });
  const last7Total = daily30Points
    .slice(-7)
    .reduce((s, p) => s + p.kwh, 0);
  const total30 = daily30Points.reduce((s, p) => s + p.kwh, 0);

  // Sparkline del hero: usa la serie horaria de hoy o fallback a últimos 7 días.
  const heroSpark =
    hourlyToday.length >= 4
      ? hourlyToday.map((r) => Number(r.power))
      : daily30Points.slice(-14).map((p) => p.kwh);

  // ── Contrato vigente ────────────────────────────────────────────
  // Tomamos el contrato más reciente entre todas las plantas del cliente.
  const contracts = client.plants
    .flatMap((p) => p.contracts.map((c) => ({ ...c, plantCapacity: Number(p.capacityKwp ?? 0) })))
    .sort(
      (a, b) =>
        new Date(b.periodMonth).getTime() - new Date(a.periodMonth).getTime(),
    );
  const latestContract = contracts[0];

  const targetEnergy = Number(latestContract?.targetEnergyKwh ?? 0);
  const targetSavings = Number(latestContract?.targetSavingsCop ?? 0);
  const targetUptime = Number(latestContract?.targetUptimePct ?? 98);
  const targetCo2 = Number(latestContract?.targetCo2Ton ?? 0);

  // Proyección: extrapolamos el promedio diario al total de días del mes.
  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const projectedKwh = Math.round(avgDailyKwh * daysInMonth);
  const projectedSavings = Math.round(projectedKwh * COP_PER_KWH);
  const projectedCo2 = projectedKwh * CO2_TON_PER_KWH;

  // Cumplimiento global (ponderado simple sobre energía como proxy).
  const energyCompliance =
    targetEnergy > 0
      ? Math.min(100, Math.round((projectedKwh / targetEnergy) * 100))
      : projectedKwh > 0
        ? 98
        : 0;

  // Helpers booleanos para los checks del contrato.
  const checks = [
    {
      label: "Energía",
      icon: Zap,
      current: projectedKwh,
      target: targetEnergy,
      format: (v: number) =>
        `${v.toLocaleString("es-CO")} / ${targetEnergy ? targetEnergy.toLocaleString("es-CO") : "—"} kWh`,
      ok: targetEnergy === 0 || projectedKwh >= targetEnergy * 0.95,
    },
    {
      label: "Ahorro",
      icon: Wallet,
      current: projectedSavings,
      target: targetSavings,
      format: (v: number) =>
        `$${(v / 1_000_000).toFixed(2)}M / $${targetSavings ? (targetSavings / 1_000_000).toFixed(2) : "—"}M`,
      ok: targetSavings === 0 || projectedSavings >= targetSavings * 0.95,
    },
    {
      label: "Uptime",
      icon: TrendingUp,
      current: uptimePct,
      target: targetUptime,
      format: (v: number) =>
        `${v.toFixed(1)}% / ${targetUptime.toFixed(0)}% SLA`,
      ok: uptimePct >= targetUptime - 0.5,
    },
    {
      label: "CO₂",
      icon: Leaf,
      current: projectedCo2,
      target: targetCo2,
      format: (v: number) =>
        `${v.toFixed(1)} / ${targetCo2 ? targetCo2.toFixed(1) : "—"} ton`,
      ok: targetCo2 === 0 || projectedCo2 >= targetCo2 * 0.9,
    },
  ];

  const displayName = firstName(user?.name ?? client.name);
  const clientCode = shortClientCode(client);
  const monthText = monthLabel(now);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
        {/* ── Volver a selector ─────────────────────────────────── */}
        {user?.role !== "viewer" ? (
          <Link
            href="/cliente"
            className="mb-4 inline-flex items-center gap-1 text-xs text-slate-500 hover:text-emerald-700"
          >
            <ChevronRight className="h-3 w-3 rotate-180" /> cambiar empresa
          </Link>
        ) : null}

        {/* ── Greeting ──────────────────────────────────────────── */}
        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-heading text-2xl font-bold text-slate-900 md:text-3xl">
              Hola, {displayName}
            </h1>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500">
              <span className="font-medium text-slate-600">{clientCode}</span>
              <span className="text-slate-300">·</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 font-medium text-amber-700 ring-1 ring-amber-200">
                <CloudSun className="h-3 w-3" />
                soleado 24°C
              </span>
            </div>
          </div>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Sun className="h-5 w-5" />
          </span>
        </header>

        {/* ── HERO ──────────────────────────────────────────────── */}
        <section className="relative mt-5 overflow-hidden rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 text-white shadow-lg md:p-8">
          <div className="relative z-10">
            <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-[11px] font-medium ring-1 ring-white/25">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-200" />
              Generando · {currentKw.toFixed(1)} kW ahora mismo
            </div>
            <div className="mt-6">
              <div className="text-xs font-medium uppercase tracking-wider opacity-80">
                Producción hoy
              </div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="font-heading text-5xl font-bold leading-none md:text-6xl">
                  {Math.round(todayKwh).toLocaleString("es-CO")}
                </span>
                <span className="text-xl font-semibold opacity-80">kWh</span>
              </div>
              <div className="mt-2 inline-flex items-center gap-1 text-sm font-medium text-emerald-50">
                <TrendingUp className="h-4 w-4" />
                {deltaPct >= 0 ? "+" : ""}
                {deltaPct.toFixed(1)}% vs promedio
              </div>
            </div>
          </div>
          {heroSpark.length > 1 ? (
            <div className="pointer-events-none absolute inset-x-0 bottom-0 opacity-60">
              <Sparkline
                data={heroSpark}
                stroke="#ecfdf5"
                fill="#ecfdf5"
                height={80}
                width={640}
                className="w-full"
              />
            </div>
          ) : null}
        </section>

        {/* ── 3 mini KPIs ───────────────────────────────────────── */}
        <section className="mt-4 grid grid-cols-3 gap-3">
          <MiniKpi
            label="Ahorro mes"
            value={`$${(savingsCop / 1_000_000).toFixed(1)}M`}
            hint="COP"
          />
          <MiniKpi
            label="CO₂ mes"
            value={co2Ton.toFixed(1)}
            hint="ton"
          />
          <MiniKpi
            label="Uptime"
            value={`${uptimePct.toFixed(1)}%`}
            hint={uptimePct >= 98 ? "Óptimo" : "Revisar"}
          />
        </section>

        {/* ── Cumplimiento contractual ──────────────────────────── */}
        <section className="mt-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="font-heading text-sm font-semibold text-slate-900">
                Cumplimiento contractual
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                {energyCompliance >= 95
                  ? "Vas por buen camino"
                  : energyCompliance >= 80
                    ? "Atento al cierre del mes"
                    : "Requiere atención"}
              </p>
            </div>
            <div className="text-right">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                {monthText}
              </span>
              <div className="font-heading text-2xl font-bold text-emerald-600">
                {energyCompliance}%
              </div>
            </div>
          </div>
          <MetricBar
            value={energyCompliance}
            max={100}
            tone={energyCompliance >= 95 ? "primary" : energyCompliance >= 80 ? "warning" : "danger"}
            className="mt-3"
          />
          <div className="mt-4 text-[11px] uppercase tracking-wider text-slate-400">
            Proyección del mes
          </div>
          <div className="font-heading text-xl font-bold text-slate-900">
            {projectedKwh.toLocaleString("es-CO")}{" "}
            <span className="text-sm font-medium text-slate-500">kWh</span>
          </div>
          <ul className="mt-4 space-y-3">
            {checks.map((c) => {
              const Icon = c.icon;
              return (
                <li
                  key={c.label}
                  className="flex items-center justify-between gap-3 rounded-xl border border-slate-100 bg-slate-50/60 px-3 py-2.5"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                      <Icon className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-slate-900">
                        {c.label}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {c.format(c.current)}
                      </div>
                    </div>
                  </div>
                  <CheckCircle2
                    className={
                      c.ok
                        ? "h-5 w-5 text-emerald-500"
                        : "h-5 w-5 text-slate-300"
                    }
                  />
                </li>
              );
            })}
          </ul>
        </section>

        {/* ── Generación últimos días ────────────────────────────── */}
        <section className="mt-4 rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
          <div className="mb-1 font-heading text-sm font-semibold text-slate-900">
            Generación últimos 7 días
          </div>
          <WeeklyGenerationChart
            data30={daily30Points}
            todayKwh={todayKwh}
            total7={last7Total}
            total30={total30}
          />
        </section>

        {/* ── Dispositivos ──────────────────────────────────────── */}
        <section className="mt-4">
          <Link
            href="#"
            className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:border-emerald-300"
          >
            <div className="min-w-0">
              <div className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
                Tus {totalDevices} dispositivos
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2 py-0.5 font-semibold text-emerald-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  {onlineDevices} Online
                </span>
                {warningDevices > 0 ? (
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 font-semibold text-amber-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    {warningDevices} Warning
                  </span>
                ) : null}
                <span className="text-slate-400">
                  · {totalKwp.toFixed(0)} kWp instalados
                </span>
              </div>
            </div>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 group-hover:gap-2">
              Ver todos <ChevronRight className="h-4 w-4" />
            </span>
          </Link>
        </section>

        {/* ── Highlight amarillo ────────────────────────────────── */}
        <section className="mt-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-100/70 p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-200 text-amber-700">
            <Trophy className="h-5 w-5" />
          </span>
          <p className="text-sm font-medium text-amber-900">
            Estás en el top 15% de nuestros clientes en eficiencia energética este mes
          </p>
        </section>

        {/* ── Asistente SunHub ──────────────────────────────────── */}
        <section className="mt-4">
          <AssistantCard />
        </section>

        <div className="mt-8 pb-10 text-center text-[10px] text-slate-400">
          Powered by SunHub · Techos Rentables
        </div>
      </div>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// Mini KPI card (compact, sin gradient) — visual del mockup.
// ────────────────────────────────────────────────────────────────────
function MiniKpi({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
        {label}
      </div>
      <div className="mt-1 font-heading text-lg font-bold text-slate-900">
        {value}
      </div>
      {hint ? (
        <div className="text-[10px] text-slate-500">{hint}</div>
      ) : null}
    </div>
  );
}
