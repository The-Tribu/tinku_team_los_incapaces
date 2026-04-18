import Link from "next/link";
import { notFound } from "next/navigation";
import {
  AlertTriangle,
  ArrowLeft,
  Battery,
  Cpu,
  Download,
  Gauge,
  Leaf,
  MapPin,
  Zap,
} from "lucide-react";
import { AppShell } from "@/components/sunhub/app-shell";
import { BrandChip } from "@/components/sunhub/brand-chip";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { MetricBar } from "@/components/sunhub/metric-bar";
import { SectionCard } from "@/components/sunhub/section-card";
import { StatusBadge } from "@/components/sunhub/status-badge";
import { cn } from "@/lib/cn";
import { displayClientLabel, isUmbrellaClient } from "@/lib/display";
import { prisma } from "@/lib/prisma";
import { BrandComparison, type BrandBar } from "./_components/brand-comparison";
import {
  GenerationVsBaseline,
  type GenerationPoint,
} from "./_components/generation-vs-baseline";

export const dynamic = "force-dynamic";

function hourLabel(date: Date): string {
  return date.toLocaleTimeString("es-CO", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}

function severityClass(severity: string): string {
  switch (severity) {
    case "critical":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    case "info":
      return "bg-sky-500";
    default:
      return "bg-slate-400";
  }
}

function deviceKindIcon(kind: string) {
  switch (kind) {
    case "battery":
      return <Battery className="h-3.5 w-3.5" />;
    case "microinverter":
      return <Cpu className="h-3.5 w-3.5" />;
    default:
      return <Zap className="h-3.5 w-3.5" />;
  }
}

function deviceKindLabel(kind: string): string {
  switch (kind) {
    case "inverter":
      return "Inversor";
    case "microinverter":
      return "Microinversor";
    case "battery":
      return "Bateria";
    default:
      return kind;
  }
}

export default async function PlantDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plant = await prisma.plant.findUnique({
    where: { id },
    include: {
      client: true,
      devices: {
        include: {
          provider: true,
          readings: { take: 1, orderBy: { ts: "desc" } },
          alarms: { where: { resolvedAt: null }, orderBy: { startedAt: "desc" } },
          baselines: { where: { metric: "power_ac_kw" } },
        },
      },
      contracts: { orderBy: { periodMonth: "desc" }, take: 1 },
    },
  });
  if (!plant) notFound();

  // ── KPIs derivados ────────────────────────────────────────
  const since48h = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const recentReadings = await prisma.reading.findMany({
    where: {
      ts: { gte: since48h },
      device: { plantId: plant.id },
    },
    orderBy: { ts: "asc" },
    select: { ts: true, powerAcKw: true, energyKwh: true, deviceId: true },
  });

  const capacityKwp = Number(plant.capacityKwp ?? 0);
  const currentPowerKw = plant.devices.reduce(
    (sum, d) => sum + Number(d.readings[0]?.powerAcKw ?? 0),
    0,
  );
  const todayEnergyKwh = plant.devices.reduce(
    (sum, d) => sum + Number(d.readings[0]?.energyKwh ?? 0),
    0,
  );
  const pr = capacityKwp > 0 ? (currentPowerKw / capacityKwp) * 100 : 0;

  // Factor estandar de Colombia ≈ 0.164 kg CO2 / kWh evitado.
  const co2AvoidedTon = (todayEnergyKwh * 0.164) / 1000;

  const deviceCount = plant.devices.length || 1;
  const onlineDevices = plant.devices.filter((d) => d.currentStatus === "online").length;
  const uptimePct = (onlineDevices / deviceCount) * 100;

  const contract = plant.contracts[0];
  const targetEnergy = Number(contract?.targetEnergyKwh ?? 0);
  const targetUptime = Number(contract?.targetUptimePct ?? 0);
  const targetPr = Number(contract?.targetPrPct ?? 0);
  const targetCo2 = Number(contract?.targetCo2Ton ?? 0);
  const energyCompliance =
    targetEnergy > 0 ? Math.min(100, ((todayEnergyKwh * 30) / targetEnergy) * 100) : 0;
  const uptimeCompliance =
    targetUptime > 0 ? Math.min(100, (uptimePct / targetUptime) * 100) : 0;
  const prCompliance = targetPr > 0 ? Math.min(100, (pr / targetPr) * 100) : 0;
  const co2Compliance =
    targetCo2 > 0 ? Math.min(100, ((co2AvoidedTon * 30) / targetCo2) * 100) : 0;

  // Estado rodado de la planta
  const statuses = plant.devices.map((d) => d.currentStatus);
  const rolledStatus =
    statuses.find((s) => s === "offline") ??
    statuses.find((s) => s === "degraded") ??
    statuses.find((s) => s === "warning") ??
    statuses.find((s) => s === "online") ??
    "unknown";

  // ── Serie generacion vs baseline (48h, por hora) ──────────
  const actualByHour = new Map<string, number>();
  for (const r of recentReadings) {
    const key = new Date(r.ts).toISOString().slice(0, 13);
    actualByHour.set(key, (actualByHour.get(key) ?? 0) + Number(r.powerAcKw ?? 0));
  }
  // Baseline: suma de medias por device. Constante por hora, pero modulada por
  // forma diurna para que se vea util en el chart.
  const baselineSumPerHour = plant.devices.reduce(
    (sum, d) => sum + Number(d.baselines[0]?.mean ?? 0),
    0,
  );

  const hours: GenerationPoint[] = [];
  const start = new Date(Date.now() - 48 * 60 * 60 * 1000);
  start.setMinutes(0, 0, 0);
  for (let h = 0; h < 48; h++) {
    const d = new Date(start.getTime() + h * 60 * 60 * 1000);
    const key = d.toISOString().slice(0, 13);
    const hourOfDay = d.getHours();
    // Forma diurna suave 6h-18h pico 12h.
    const diurnal =
      hourOfDay < 6 || hourOfDay > 18
        ? 0
        : Math.sin(((hourOfDay - 6) / 12) * Math.PI);
    const baselineVal = baselineSumPerHour > 0 ? baselineSumPerHour * diurnal : null;
    const actualVal = actualByHour.has(key) ? actualByHour.get(key) ?? 0 : null;
    hours.push({
      ts: d.toISOString(),
      label: hourLabel(d),
      actual: actualVal,
      baseline: baselineVal,
    });
  }

  // ── Comparativa por marca dentro de la planta ─────────────
  const brandMap = new Map<string, BrandBar>();
  for (const d of plant.devices) {
    const slug = d.provider.slug;
    const prev = brandMap.get(slug) ?? {
      slug,
      devices: 0,
      powerKw: 0,
      onlinePct: 0,
    };
    prev.devices += 1;
    prev.powerKw += Number(d.readings[0]?.powerAcKw ?? 0);
    if (d.currentStatus === "online") prev.onlinePct += 1;
    brandMap.set(slug, prev);
  }
  const brandBars: BrandBar[] = Array.from(brandMap.values())
    .map((b) => ({
      ...b,
      onlinePct: b.devices > 0 ? (b.onlinePct / b.devices) * 100 : 0,
    }))
    .sort((a, b) => b.powerKw - a.powerKw);

  // ── Alarmas activas de la planta ──────────────────────────
  const activeAlarms = plant.devices
    .flatMap((d) =>
      d.alarms.map((a) => ({
        id: a.id,
        severity: a.severity,
        message: a.message,
        type: a.type,
        deviceExternalId: d.externalId,
        brand: d.provider.slug,
        startedAt: a.startedAt,
      })),
    )
    .sort(
      (a, b) =>
        new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
    );

  const distinctBrands = Array.from(new Set(plant.devices.map((d) => d.provider.slug)));

  const clientLabel = displayClientLabel(plant.client, { name: plant.name });
  const clientIsUmbrella = isUmbrellaClient(plant.client?.name);
  const headerSubtitle = [
    plant.code,
    clientIsUmbrella ? null : clientLabel,
    plant.location,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <AppShell
      title={plant.name}
      subtitle={headerSubtitle}
      actions={
        <div className="flex items-center gap-2">
          <Link
            href="/plantas"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
            Volver
          </Link>
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Reporte PDF
          </button>
        </div>
      }
    >
      {/* Header banner con identidad de la planta */}
      <section className="rounded-2xl border border-slate-200/70 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-heading text-xl font-semibold text-slate-900">
                {plant.name}
              </h2>
              <span className="font-mono text-xs text-slate-500">{plant.code}</span>
              <StatusBadge status={rolledStatus} />
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500">
              {clientIsUmbrella ? null : (
                <span className="text-slate-600">{clientLabel}</span>
              )}
              {plant.location ? (
                <span className="inline-flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {plant.location}
                </span>
              ) : null}
              <span className="inline-flex items-center gap-1">
                <Gauge className="h-3 w-3" />
                {capacityKwp.toLocaleString("es-CO", { maximumFractionDigits: 1 })} kWp
              </span>
              <span>{plant.devices.length} dispositivos</span>
            </div>
            {distinctBrands.length > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1">
                {distinctBrands.map((b) => (
                  <BrandChip key={b} slug={b} size="sm" />
                ))}
              </div>
            ) : null}
          </div>
          <div className="grid w-full grid-cols-2 gap-2 md:w-auto md:grid-cols-4">
            <KpiCard
              compact
              tone="primary"
              label="Generacion hoy"
              value={todayEnergyKwh.toLocaleString("es-CO", {
                maximumFractionDigits: 1,
              })}
              unit="kWh"
              icon={<Zap className="h-4 w-4" />}
            />
            <KpiCard
              compact
              tone="info"
              label="Uptime"
              value={uptimePct.toFixed(1)}
              unit="%"
              icon={<Gauge className="h-4 w-4" />}
            />
            <KpiCard
              compact
              tone={pr >= 80 ? "primary" : pr >= 65 ? "warning" : "danger"}
              label="Performance Ratio"
              value={pr.toFixed(1)}
              unit="%"
            />
            <KpiCard
              compact
              tone="violet"
              label="CO2 evitado"
              value={co2AvoidedTon.toFixed(2)}
              unit="ton"
              icon={<Leaf className="h-4 w-4" />}
            />
          </div>
        </div>
      </section>

      {/* Generacion vs baseline + comparativa entre marcas */}
      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Generacion vs baseline"
          subtitle="Ultimas 48 horas, por hora"
          actions={
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
                Real
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="inline-block h-2 w-2 rounded-full bg-slate-400" />
                Baseline
              </span>
            </div>
          }
        >
          <GenerationVsBaseline data={hours} height={260} />
        </SectionCard>
        <SectionCard
          title="Comparativa entre marcas"
          subtitle={
            distinctBrands.length > 1
              ? `${distinctBrands.length} marcas instaladas en planta`
              : "Una sola marca instalada"
          }
        >
          <BrandComparison bars={brandBars} />
        </SectionCard>
      </section>

      {/* Dispositivos en planta */}
      <section className="mt-5">
        <SectionCard
          title="Dispositivos en planta"
          subtitle={`${plant.devices.length} unidades monitoreadas`}
          actions={
            <div className="flex items-center gap-3 text-[11px] text-slate-500">
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                {onlineDevices} online
              </span>
              <span className="inline-flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
                {plant.devices.length - onlineDevices} fuera
              </span>
            </div>
          }
        >
          <div className="-mx-5 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                  <th className="px-5 py-2">SN / ID</th>
                  <th className="px-5 py-2">Tipo</th>
                  <th className="px-5 py-2">Marca</th>
                  <th className="px-5 py-2">Estado</th>
                  <th className="px-5 py-2">Ultima lectura</th>
                  <th className="px-5 py-2 text-right">Potencia</th>
                  <th className="px-5 py-2 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody>
                {plant.devices.map((d) => {
                  const lastReading = d.readings[0];
                  const lastTs = lastReading?.ts ?? d.lastSeenAt ?? null;
                  return (
                    <tr
                      key={d.id}
                      className="border-t border-slate-100 hover:bg-slate-50"
                    >
                      <td className="px-5 py-3">
                        <div className="font-mono text-xs text-slate-700">
                          {d.externalId}
                        </div>
                        {d.model ? (
                          <div className="mt-0.5 text-[11px] text-slate-500">
                            {d.model}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-5 py-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                          {deviceKindIcon(d.kind)}
                          {deviceKindLabel(d.kind)}
                        </span>
                      </td>
                      <td className="px-5 py-3">
                        <BrandChip slug={d.provider.slug} size="sm" />
                      </td>
                      <td className="px-5 py-3">
                        <StatusBadge status={d.currentStatus} />
                      </td>
                      <td className="px-5 py-3 text-xs text-slate-500">
                        {lastTs
                          ? new Date(lastTs).toLocaleString("es-CO", {
                              day: "2-digit",
                              month: "short",
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : "Sin datos"}
                      </td>
                      <td className="px-5 py-3 text-right tabular-nums text-slate-700">
                        {Number(lastReading?.powerAcKw ?? 0).toFixed(1)}{" "}
                        <span className="text-xs text-slate-400">kW</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <Link
                          href={`/alarmas?device=${d.externalId}`}
                          className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
                        >
                          Ver historial
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </SectionCard>
      </section>

      {/* Cumplimiento + Alarmas activas */}
      <section className="mt-5 grid gap-4 lg:grid-cols-3">
        <SectionCard
          className="lg:col-span-2"
          title="Cumplimiento contractual"
          subtitle={
            contract
              ? `Periodo ${contract.periodMonth.toLocaleDateString("es-CO", {
                  month: "long",
                  year: "numeric",
                })}`
              : "Sin contrato definido"
          }
        >
          {contract ? (
            <div className="space-y-4">
              <ComplianceRow
                label="Energia proyectada"
                target={`${Number(contract.targetEnergyKwh ?? 0).toLocaleString("es-CO")} kWh`}
                value={energyCompliance}
              />
              <ComplianceRow
                label="Uptime"
                target={`≥ ${Number(contract.targetUptimePct ?? 0).toFixed(1)}%`}
                value={uptimeCompliance}
              />
              <ComplianceRow
                label="Performance Ratio"
                target={`≥ ${Number(contract.targetPrPct ?? 0).toFixed(1)}%`}
                value={prCompliance}
              />
              <ComplianceRow
                label="CO2 evitado"
                target={`${Number(contract.targetCo2Ton ?? 0).toFixed(2)} ton`}
                value={co2Compliance}
              />
            </div>
          ) : (
            <p className="text-sm text-slate-500">
              Aun no se ha registrado un contrato para esta planta.
            </p>
          )}
        </SectionCard>

        <SectionCard
          title="Alarmas activas"
          subtitle={`${activeAlarms.length} sin resolver`}
          actions={
            <Link
              href={`/alarmas?plant=${plant.code}`}
              className="text-xs font-medium text-emerald-700 hover:text-emerald-800"
            >
              Ver todas
            </Link>
          }
        >
          {activeAlarms.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-6 text-center text-sm text-slate-500">
              <div className="rounded-full bg-emerald-50 p-2 text-emerald-600">
                <AlertTriangle className="h-4 w-4" />
              </div>
              Sin alarmas activas
            </div>
          ) : (
            <ul className="space-y-2">
              {activeAlarms.slice(0, 6).map((a) => (
                <li
                  key={a.id}
                  className="flex items-start gap-2 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2"
                >
                  <span
                    className={cn(
                      "mt-1 h-2 w-2 flex-shrink-0 rounded-full",
                      severityClass(a.severity),
                    )}
                    aria-hidden
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium text-slate-800">
                        {a.message}
                      </span>
                      <BrandChip slug={a.brand} size="sm" />
                    </div>
                    <div className="mt-0.5 flex items-center justify-between gap-2 text-[11px] text-slate-500">
                      <span className="font-mono">{a.deviceExternalId}</span>
                      <span>
                        {new Date(a.startedAt).toLocaleString("es-CO", {
                          day: "2-digit",
                          month: "short",
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </span>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>
      </section>
    </AppShell>
  );
}

function ComplianceRow({
  label,
  target,
  value,
}: {
  label: string;
  target: string;
  value: number;
}) {
  const tone = value >= 95 ? "primary" : value >= 80 ? "warning" : "danger";
  return (
    <div>
      <div className="flex items-center justify-between text-sm">
        <div>
          <div className="font-medium text-slate-800">{label}</div>
          <div className="text-[11px] text-slate-500">Meta: {target}</div>
        </div>
        <span
          className={cn(
            "tabular-nums text-sm font-semibold",
            tone === "primary"
              ? "text-emerald-600"
              : tone === "warning"
                ? "text-amber-600"
                : "text-red-600",
          )}
        >
          {value.toFixed(0)}%
        </span>
      </div>
      <MetricBar className="mt-1.5" value={value} tone={tone} />
    </div>
  );
}
