import Link from "next/link";
import { ChevronRight, Download, Plus } from "lucide-react";
import { AppShell } from "@/components/sunhub/app-shell";
import { BrandChip } from "@/components/sunhub/brand-chip";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { MetricBar } from "@/components/sunhub/metric-bar";
import { Sparkline } from "@/components/sunhub/sparkline";
import { StatusBadge } from "@/components/sunhub/status-badge";
import { LiveRefresh } from "@/components/sunhub/live-refresh";
import { displayClientLabel } from "@/lib/display";
import { prisma } from "@/lib/prisma";
import { PlantFilters } from "./_components/plant-filters";
import { PlantRow } from "./_components/plant-row";

export const dynamic = "force-dynamic";

const STATUSES: { slug: string; label: string }[] = [
  { slug: "online", label: "Activas" },
  { slug: "warning", label: "Aviso" },
  { slug: "degraded", label: "Degradadas" },
  { slug: "offline", label: "Offline" },
];

const SORTS: { slug: string; label: string }[] = [
  { slug: "code_asc", label: "Codigo (A-Z)" },
  { slug: "capacity_desc", label: "Capacidad (mayor)" },
  { slug: "capacity_asc", label: "Capacidad (menor)" },
  { slug: "uptime_desc", label: "Uptime (mayor)" },
  { slug: "uptime_asc", label: "Uptime (menor)" },
  { slug: "generation_desc", label: "Generacion hoy (mayor)" },
];

type SearchParams = {
  status?: string;
  brand?: string;
  q?: string;
  sort?: string;
};

type PlantRowData = {
  id: string;
  code: string;
  name: string;
  client: string;
  brands: string[];
  capacityKwp: number;
  todayEnergyKwh: number;
  generationSpark: number[];
  uptimePct: number;
  compliancePct: number;
  status: string;
  alarms: number;
};

async function loadPlants(filter: SearchParams): Promise<{
  rows: PlantRowData[];
  counts: { total: number; online: number; warning: number; offline: number; critical: number };
  brandCatalog: string[];
}> {
  const activeBrands = filter.brand
    ? filter.brand
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  const wherePlant: Record<string, unknown> = {};
  const deviceConditions: Record<string, unknown>[] = [];
  if (filter.status) deviceConditions.push({ currentStatus: filter.status });
  if (activeBrands.length > 0) deviceConditions.push({ provider: { slug: { in: activeBrands } } });
  if (deviceConditions.length > 0) {
    wherePlant.devices = { some: { AND: deviceConditions } };
  }
  if (filter.q) {
    wherePlant.OR = [
      { name: { contains: filter.q, mode: "insensitive" } },
      { code: { contains: filter.q, mode: "insensitive" } },
      { client: { name: { contains: filter.q, mode: "insensitive" } } },
    ];
  }

  const sort = filter.sort ?? "code_asc";
  const orderBy: Record<string, "asc" | "desc"> =
    sort === "capacity_desc"
      ? { capacityKwp: "desc" }
      : sort === "capacity_asc"
        ? { capacityKwp: "asc" }
        : { code: "asc" };

  const [plants, providers, countAll, countOnline, countWarning, countOffline, countCritical] =
    await Promise.all([
      prisma.plant.findMany({
        where: wherePlant,
        orderBy,
        take: 200,
        include: {
          client: { select: { name: true } },
          devices: {
            include: {
              provider: { select: { slug: true } },
              readings: {
                take: 12,
                orderBy: { ts: "desc" },
                select: { powerAcKw: true, energyKwh: true, ts: true },
              },
              alarms: {
                where: { resolvedAt: null },
                select: { id: true, severity: true },
              },
            },
          },
          contracts: {
            orderBy: { periodMonth: "desc" },
            take: 1,
            select: { targetEnergyKwh: true, targetUptimePct: true },
          },
        },
      }),
      prisma.provider.findMany({ select: { slug: true } }),
      prisma.plant.count(),
      prisma.device.count({ where: { currentStatus: "online" } }),
      prisma.device.count({ where: { currentStatus: { in: ["warning", "degraded"] } } }),
      prisma.device.count({ where: { currentStatus: "offline" } }),
      prisma.alarm.count({ where: { resolvedAt: null, severity: "critical" } }),
    ]);

  const rows: PlantRowData[] = plants.map((p) => {
    const brands = Array.from(new Set(p.devices.map((d) => d.provider.slug)));

    const todayEnergy = p.devices.reduce(
      (sum, d) => sum + Number(d.readings[0]?.energyKwh ?? 0),
      0,
    );

    const bucket = new Map<string, number>();
    for (const d of p.devices) {
      for (const r of d.readings) {
        const hr = new Date(r.ts).toISOString().slice(0, 13);
        bucket.set(hr, (bucket.get(hr) ?? 0) + Number(r.powerAcKw ?? 0));
      }
    }
    const spark = Array.from(bucket.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, v]) => v);

    const deviceCount = p.devices.length || 1;
    const onlineDevices = p.devices.filter((d) => d.currentStatus === "online").length;
    const uptimePct = Math.round((onlineDevices / deviceCount) * 1000) / 10;

    const target = Number(p.contracts[0]?.targetEnergyKwh ?? 0);
    const compliancePct =
      target > 0 ? Math.min(100, Math.round(((todayEnergy * 30) / target) * 1000) / 10) : 0;

    const alarms = p.devices.reduce((sum, d) => sum + d.alarms.length, 0);

    const statuses = p.devices.map((d) => d.currentStatus);
    const rolled =
      statuses.find((s) => s === "offline") ??
      statuses.find((s) => s === "degraded") ??
      statuses.find((s) => s === "warning") ??
      statuses.find((s) => s === "online") ??
      "unknown";

    return {
      id: p.id,
      code: p.code,
      name: p.name,
      client: displayClientLabel(p.client, { name: p.name }),
      brands,
      capacityKwp: Number(p.capacityKwp ?? 0),
      todayEnergyKwh: todayEnergy,
      generationSpark: spark,
      uptimePct,
      compliancePct,
      status: rolled,
      alarms,
    };
  });

  // Orden dependiente de campos derivados
  if (sort === "uptime_desc") rows.sort((a, b) => b.uptimePct - a.uptimePct);
  else if (sort === "uptime_asc") rows.sort((a, b) => a.uptimePct - b.uptimePct);
  else if (sort === "generation_desc") rows.sort((a, b) => b.todayEnergyKwh - a.todayEnergyKwh);

  return {
    rows,
    counts: {
      total: countAll,
      online: countOnline,
      warning: countWarning,
      offline: countOffline,
      critical: countCritical,
    },
    brandCatalog: providers.map((p) => p.slug),
  };
}

export default async function PlantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { rows, counts, brandCatalog } = await loadPlants(sp);
  const activeBrands = sp.brand
    ? sp.brand
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean)
    : [];

  return (
    <AppShell
      title="Plantas solares"
      subtitle={`${counts.total} instalaciones activas`}
      actions={
        <div className="flex items-center gap-3">
          <LiveRefresh intervalMs={30_000} />
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-4 w-4" />
            Exportar CSV
          </button>
          <Link
            href="/onboarding"
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700"
          >
            <Plus className="h-4 w-4" />
            Nueva planta
          </Link>
        </div>
      }
    >
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          compact
          tone="neutral"
          label="Plantas totales"
          value={counts.total.toString()}
          hint="Instalaciones activas en la cartera"
        />
        <KpiCard
          compact
          tone="primary"
          label="Activas"
          value={counts.online.toString()}
          hint="Dispositivos online ahora"
        />
        <KpiCard
          compact
          tone="danger"
          label="Alarmas criticas"
          value={counts.critical.toString()}
          hint="Sin resolver"
        />
        <KpiCard
          compact
          tone="warning"
          label="Offline"
          value={counts.offline.toString()}
          hint="Dispositivos sin reportar"
        />
      </section>

      <div className="mt-5">
        <PlantFilters
          brands={brandCatalog}
          activeBrands={activeBrands}
          statuses={STATUSES}
          activeStatus={sp.status ?? null}
          sorts={SORTS}
          activeSort={sp.sort ?? "code_asc"}
          search={sp.q ?? ""}
        />
      </div>

      <div className="mt-5 overflow-hidden rounded-2xl border border-slate-200/70 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="max-h-[calc(100vh-320px)] overflow-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
              <tr className="text-left text-[11px] font-medium uppercase tracking-wider text-slate-500">
                <th className="px-4 py-3">Planta</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Marca</th>
                <th className="px-4 py-3 text-right">Capacidad</th>
                <th className="px-4 py-3 text-right">Generacion hoy</th>
                <th className="px-4 py-3">Uptime</th>
                <th className="px-4 py-3">Cumplimiento</th>
                <th className="px-4 py-3">Estado</th>
                <th className="px-4 py-3" aria-label="acciones" />
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="px-4 py-12 text-center text-sm text-slate-500"
                  >
                    Sin plantas que coincidan con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                rows.map((p) => (
                  <PlantRow key={p.id} href={`/plantas/${p.id}`}>
                    <td className="px-4 py-3 align-middle">
                      <div className="font-medium text-slate-900">{p.name}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500">
                        {p.code}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle text-slate-700">
                      {p.client}
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex flex-wrap items-center gap-1">
                        {p.brands.length === 0 ? (
                          <span className="text-xs text-slate-400">—</span>
                        ) : (
                          p.brands.slice(0, 3).map((b) => (
                            <BrandChip key={b} slug={b} size="sm" />
                          ))
                        )}
                        {p.brands.length > 3 ? (
                          <span className="text-[10px] text-slate-500">
                            +{p.brands.length - 3}
                          </span>
                        ) : null}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right align-middle tabular-nums text-slate-700">
                      {p.capacityKwp.toLocaleString("es-CO", {
                        maximumFractionDigits: 1,
                      })}{" "}
                      <span className="text-xs text-slate-400">kWp</span>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center justify-end gap-2">
                        <span className="tabular-nums text-slate-700">
                          {p.todayEnergyKwh.toLocaleString("es-CO", {
                            maximumFractionDigits: 1,
                          })}
                        </span>
                        <span className="text-xs text-slate-400">kWh</span>
                        {p.generationSpark.length > 1 ? (
                          <Sparkline
                            data={p.generationSpark}
                            stroke="#16a34a"
                            fill="#16a34a"
                            height={22}
                            width={64}
                          />
                        ) : (
                          <div className="h-[22px] w-16" />
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2">
                        <MetricBar
                          value={p.uptimePct}
                          tone={
                            p.uptimePct >= 95
                              ? "primary"
                              : p.uptimePct >= 85
                                ? "warning"
                                : "danger"
                          }
                          className="w-20"
                        />
                        <span className="min-w-[3ch] text-right text-xs tabular-nums text-slate-600">
                          {p.uptimePct.toFixed(1)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <div className="flex items-center gap-2">
                        <MetricBar
                          value={p.compliancePct}
                          tone={
                            p.compliancePct >= 95
                              ? "primary"
                              : p.compliancePct >= 80
                                ? "warning"
                                : "danger"
                          }
                          className="w-20"
                        />
                        <span className="min-w-[3ch] text-right text-xs tabular-nums text-slate-600">
                          {p.compliancePct.toFixed(0)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 align-middle">
                      <StatusBadge status={p.status} />
                      {p.alarms > 0 ? (
                        <span className="ml-1 rounded-full bg-red-50 px-1.5 text-[10px] font-medium text-red-600 ring-1 ring-red-200">
                          {p.alarms}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 align-middle text-right">
                      <span
                        className="inline-flex items-center gap-0.5 rounded-md p-1 text-slate-400"
                        aria-hidden
                      >
                        <ChevronRight className="h-4 w-4" />
                      </span>
                    </td>
                  </PlantRow>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-4 py-2 text-xs text-slate-500">
          <span>
            Mostrando {rows.length} de {counts.total} plantas
          </span>
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {counts.online} online
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
              {counts.warning} aviso
            </span>
            <span className="inline-flex items-center gap-1">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500" />
              {counts.offline} offline
            </span>
          </span>
        </div>
      </div>
    </AppShell>
  );
}
