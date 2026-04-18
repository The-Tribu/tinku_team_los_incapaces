import { notFound } from "next/navigation";
import Link from "next/link";
import {
  ArrowRight,
  Award,
  Bolt,
  ChevronLeft,
  Leaf,
  Timer,
  TrendingUp,
  Wallet,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { AssistantCard } from "./assistant-card";
import { TopBar } from "./top-bar";
import { WeeklyBars, type WeeklyPoint } from "./weekly-bars";

export const dynamic = "force-dynamic";

// Tarifa promedio simplificada (COP/kWh) y factor de emisiones (ton/kWh).
const COP_PER_KWH = 680;
const CO2_TON_PER_KWH = 0.000164;

type DeviceStatus = "online" | "warning" | "offline" | "degraded" | "unknown";

function firstName(name: string | null | undefined) {
  if (!name) return "cliente";
  return name.trim().split(/\s+/)[0] ?? "cliente";
}

function monthLabel(d: Date) {
  const s = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, plant] = await Promise.all([
    getSessionUser(),
    prisma.plant.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, region: true } },
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
    }),
  ]);

  if (!plant) notFound();

  const deviceIds = plant.devices.map((d) => d.id);
  const totalDevices = plant.devices.length;
  const onlineDevices = plant.devices.filter(
    (d) => (d.currentStatus as DeviceStatus) === "online",
  ).length;
  const warningDevices = plant.devices.filter((d) => {
    const s = d.currentStatus as DeviceStatus;
    return s === "warning" || s === "degraded";
  }).length;
  const totalKwp = Number(plant.capacityKwp ?? 0);
  const uptimePct =
    totalDevices > 0 ? (onlineDevices / totalDevices) * 100 : 0;

  // Producción hoy + mes + serie diaria de 7 días.
  const [todayAgg, monthAgg, daily7] = deviceIds.length
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
              (now() at time zone 'America/Bogota')::date - INTERVAL '6 days',
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
              AND r.ts >= (now() at time zone 'America/Bogota')::date - INTERVAL '7 days'
            GROUP BY 1, 2
          )
          SELECT d.day AS day,
                 COALESCE(SUM(p.delta), 0)::float AS energy
          FROM days d
          LEFT JOIN per_device p ON p.day = d.day
          GROUP BY d.day
          ORDER BY d.day ASC
        `,
      ])
    : [
        [] as Array<{ energy: number; power: number }>,
        [] as Array<{ energy: number }>,
        [] as Array<{ day: Date; energy: number }>,
      ];

  const currentKw = todayAgg[0]?.power ?? 0;
  const todayKwh = todayAgg[0]?.energy ?? 0;
  const monthKwh = Math.max(0, monthAgg[0]?.energy ?? todayKwh * 30);
  const savingsCop = Math.round(monthKwh * COP_PER_KWH);
  const co2Ton = monthKwh * CO2_TON_PER_KWH;

  const now = new Date();
  const daysElapsed = Math.max(1, now.getDate());
  const avgDailyKwh = monthKwh / daysElapsed;
  const deltaPct =
    avgDailyKwh > 0 ? ((todayKwh - avgDailyKwh) / avgDailyKwh) * 100 : 0;

  // Barras de 7 días — hoy resaltado.
  const dayFmt = new Intl.DateTimeFormat("es-CO", { weekday: "short" });
  const todayKey = now.toISOString().slice(0, 10);
  const weekly: WeeklyPoint[] = daily7.map((row) => {
    const d = new Date(row.day);
    const key = d.toISOString().slice(0, 10);
    const label = dayFmt.format(d).replace(".", "");
    return {
      label: label.charAt(0).toUpperCase() + label.slice(1),
      kwh: Number(row.energy),
      isToday: key === todayKey,
    };
  });
  const last7Total = weekly.reduce((s, p) => s + p.kwh, 0);

  // Contrato vigente de la planta.
  const latestContract = plant.contracts[0];
  const targetEnergy = Number(latestContract?.targetEnergyKwh ?? 0);
  const targetSavings = Number(latestContract?.targetSavingsCop ?? 0);
  const targetUptime = Number(latestContract?.targetUptimePct ?? 98);
  const targetCo2 = Number(latestContract?.targetCo2Ton ?? 0);

  const daysInMonth = new Date(
    now.getFullYear(),
    now.getMonth() + 1,
    0,
  ).getDate();
  const projectedKwh = Math.round(avgDailyKwh * daysInMonth);
  const projectedSavings = Math.round(projectedKwh * COP_PER_KWH);
  const projectedCo2 = projectedKwh * CO2_TON_PER_KWH;

  const energyCompliance =
    targetEnergy > 0
      ? Math.min(100, Math.round((projectedKwh / targetEnergy) * 100))
      : projectedKwh > 0
        ? 98
        : 0;

  const checks: Array<{
    label: string;
    icon: typeof Bolt;
    value: string;
    tone: "ok" | "soft";
  }> = [
    {
      label: "Energía",
      icon: Bolt,
      value: `${projectedKwh.toLocaleString("es-CO")} / ${
        targetEnergy ? targetEnergy.toLocaleString("es-CO") : "—"
      } kWh`,
      tone: targetEnergy === 0 || projectedKwh >= targetEnergy * 0.95 ? "ok" : "soft",
    },
    {
      label: "Ahorro",
      icon: Wallet,
      value: `$${(projectedSavings / 1_000_000).toFixed(1)}M / $${
        targetSavings ? (targetSavings / 1_000_000).toFixed(1) : "—"
      }M`,
      tone: targetSavings === 0 || projectedSavings >= targetSavings * 0.95 ? "ok" : "soft",
    },
    {
      label: "Uptime",
      icon: Timer,
      value: `${uptimePct.toFixed(1)}% / ${targetUptime.toFixed(0)}% SLA`,
      tone: uptimePct >= targetUptime - 0.5 ? "ok" : "soft",
    },
    {
      label: "CO₂",
      icon: Leaf,
      value: `${projectedCo2.toFixed(1)} / ${
        targetCo2 ? targetCo2.toFixed(1) : "—"
      } ton`,
      tone: targetCo2 === 0 || projectedCo2 >= targetCo2 * 0.9 ? "ok" : "soft",
    },
  ];

  const displayName = firstName(user?.name ?? plant.name);
  const monthText = monthLabel(now).toUpperCase();
  const location = plant.location ?? plant.client.region ?? plant.client.name;

  return (
    <>
      <TopBar
        plantId={id}
        plantName={plant.name}
        greetingName={displayName}
        subtitle={`${plant.name} · ${location}`}
      />

      <Link
        href="/cliente"
        className="mx-5 mt-1 inline-flex items-center gap-1 text-[11px] text-m3-outline hover:text-m3-primary"
      >
        <ChevronLeft className="h-3 w-3" /> cambiar planta
      </Link>

      <main className="mx-auto mt-2 w-full max-w-lg space-y-6 px-5">
        {/* Hero: producción hoy */}
        <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-m3-primary to-m3-primary-container p-7 text-white shadow-[0_24px_48px_-18px_rgba(0,107,44,0.55)]">
          <div className="relative z-10">
            <span className="inline-flex items-center gap-2 rounded-full bg-white/20 px-3.5 py-1.5 text-[11px] font-semibold backdrop-blur-md">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-m3-primary-fixed" />
              Generando · {currentKw.toFixed(1)} kW ahora mismo
            </span>
            <p className="mt-6 text-sm font-medium text-white/80">
              Producción hoy
            </p>
            <div className="mt-1 flex items-baseline gap-2">
              <span className="font-heading text-6xl font-extrabold leading-none tracking-tighter">
                {Math.round(todayKwh).toLocaleString("es-CO")}
              </span>
              <span className="text-2xl font-bold">kWh</span>
            </div>
            <p className="mt-3 inline-flex items-center gap-1 text-sm font-semibold text-m3-primary-fixed">
              <TrendingUp className="h-4 w-4" />
              {deltaPct >= 0 ? "+" : ""}
              {deltaPct.toFixed(1)}% vs promedio
            </p>
          </div>
          <svg
            aria-hidden="true"
            viewBox="0 0 400 100"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-24 w-full opacity-30"
          >
            <path
              d="M0,80 Q50,70 80,40 T150,50 T220,20 T300,60 T400,10"
              fill="none"
              stroke="white"
              strokeLinecap="round"
              strokeWidth="4"
            />
          </svg>
        </section>

        {/* 3 mini KPIs */}
        <section className="grid grid-cols-3 gap-3">
          <MiniKpi
            label="Ahorro mes"
            value={`$${(savingsCop / 1_000_000).toFixed(1)}M`}
            hint="COP"
            accent
          />
          <MiniKpi
            label="CO₂ mes"
            value={`${co2Ton.toFixed(1)} ton`}
            hint="🌱 Evitado"
          />
          <MiniKpi
            label="Uptime"
            value={`${uptimePct.toFixed(1)}%`}
            hint={uptimePct >= 98 ? "✓ Óptimo" : "Revisar"}
          />
        </section>

        {/* Cumplimiento contractual */}
        <section className="rounded-[2rem] bg-m3-surface-container-low p-6">
          <div className="flex items-start justify-between">
            <h3 className="font-heading text-lg font-bold tracking-tight text-m3-on-surface">
              Cumplimiento contractual
            </h3>
            <span className="text-[10px] font-bold uppercase tracking-widest text-m3-outline">
              {monthText}
            </span>
          </div>
          <div className="mt-4">
            <div className="flex items-end justify-between">
              <p className="text-xs font-semibold text-m3-primary">
                {energyCompliance >= 95
                  ? "Vas por buen camino"
                  : energyCompliance >= 80
                    ? "Atento al cierre del mes"
                    : "Requiere atención"}
              </p>
              <p className="font-heading text-lg font-bold">
                {energyCompliance}%
              </p>
            </div>
            <div className="mt-2 h-3 w-full overflow-hidden rounded-full bg-m3-surface-container-high">
              <div
                className="h-full rounded-full bg-m3-primary transition-all duration-500"
                style={{ width: `${energyCompliance}%` }}
              />
            </div>
            <p className="mt-2 text-center text-[11px] italic text-m3-outline">
              Proyección de mes: {projectedKwh.toLocaleString("es-CO")} kWh
            </p>
          </div>
          <ul className="mt-4 space-y-3 border-t border-m3-outline-variant/30 pt-4">
            {checks.map((c) => {
              const Icon = c.icon;
              return (
                <li
                  key={c.label}
                  className="flex items-center justify-between gap-3"
                >
                  <div className="flex items-center gap-3">
                    <Icon className="h-5 w-5 text-m3-primary" />
                    <span className="text-xs font-medium text-m3-on-surface">
                      {c.label}
                    </span>
                  </div>
                  <p className="text-[11px] font-semibold text-m3-on-surface">
                    {c.value}
                    {c.tone === "ok" ? (
                      <span className="ml-1 text-m3-primary">✓</span>
                    ) : null}
                  </p>
                </li>
              );
            })}
          </ul>
        </section>

        {/* Generación 7 días */}
        <section className="rounded-[2rem] bg-m3-surface-container-lowest p-6 shadow-sm">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-m3-outline">
                Generación últimos 7 días
              </h3>
              <p className="font-heading text-2xl font-black text-m3-on-surface">
                {Math.round(last7Total).toLocaleString("es-CO")}{" "}
                <span className="text-sm font-medium text-m3-outline">kWh</span>
              </p>
            </div>
          </div>
          {weekly.length === 0 ? (
            <div className="flex h-32 items-center justify-center text-xs text-m3-outline">
              Aún no hay lecturas para esta semana.
            </div>
          ) : (
            <WeeklyBars data={weekly} />
          )}
        </section>

        {/* Dispositivos */}
        <Link
          href={`/cliente/${id}/energia`}
          className="flex items-center justify-between gap-3 rounded-[2rem] bg-m3-surface-container-lowest p-6 shadow-sm transition active:scale-[0.99]"
        >
          <div>
            <h3 className="mb-2 text-sm font-bold text-m3-outline">
              Tus {totalDevices} dispositivos
            </h3>
            <div className="flex flex-wrap gap-2">
              <span className="rounded-full bg-m3-surface-container-low px-3 py-1 text-[10px] font-bold text-m3-primary">
                🟢 {onlineDevices} Online
              </span>
              {warningDevices > 0 ? (
                <span className="rounded-full bg-m3-secondary-container/30 px-3 py-1 text-[10px] font-bold text-m3-on-secondary-container">
                  🟡 {warningDevices} Warning
                </span>
              ) : null}
              <span className="rounded-full px-1 py-1 text-[10px] font-medium text-m3-outline">
                {totalKwp.toFixed(0)} kWp
              </span>
            </div>
          </div>
          <span className="flex items-center gap-1 text-xs font-bold text-m3-primary">
            Ver todos <ArrowRight className="h-4 w-4" />
          </span>
        </Link>

        {/* Highlight amarillo */}
        <section className="relative overflow-hidden rounded-[2rem] bg-m3-secondary-container p-6">
          <Award
            aria-hidden="true"
            className="absolute -right-3 -top-3 h-28 w-28 text-m3-on-secondary-container/10"
          />
          <div className="relative z-10 flex items-center gap-4">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-white/40">
              <Award className="h-6 w-6 text-m3-on-secondary-container" />
            </div>
            <p className="text-sm font-bold leading-tight text-m3-on-secondary-container">
              Estás en el top 15% de nuestros clientes en eficiencia energética
              este mes 🏆
            </p>
          </div>
        </section>

        {/* Asistente */}
        <section>
          <AssistantCard />
        </section>

        <p className="pt-2 text-center text-[10px] text-m3-outline">
          Powered by SunHub · Techos Rentables
        </p>
      </main>
    </>
  );
}

function MiniKpi({
  label,
  value,
  hint,
  accent = false,
}: {
  label: string;
  value: string;
  hint?: string;
  accent?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-m3-surface-container-lowest p-4 text-center shadow-sm">
      <p className="text-[10px] font-bold uppercase tracking-wider text-m3-outline">
        {label}
      </p>
      <p
        className={
          accent
            ? "mt-1 font-heading text-sm font-bold text-m3-primary"
            : "mt-1 font-heading text-sm font-bold text-m3-on-surface"
        }
      >
        {value}
      </p>
      {hint ? (
        <p className="mt-0.5 text-[9px] text-stone-400">{hint}</p>
      ) : null}
    </div>
  );
}
