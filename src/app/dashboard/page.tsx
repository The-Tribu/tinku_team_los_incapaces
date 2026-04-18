import Link from "next/link";
import { AppShell } from "@/components/sunhub/app-shell";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { GenerationChart } from "@/components/sunhub/generation-chart";
import { FleetOverview } from "@/components/sunhub/fleet-overview";
import { getFleetSummary, getTopPlants } from "@/lib/fleet";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const [summary, topPlants, openAlarms] = await Promise.all([
    getFleetSummary(),
    getTopPlants(5),
    prisma.alarm.findMany({
      where: { resolvedAt: null },
      take: 5,
      orderBy: { startedAt: "desc" },
      include: { device: { select: { plant: { select: { name: true, code: true } } } } },
    }),
  ]);

  return (
    <AppShell
      title="Dashboard Global"
      subtitle={`${summary.totalPlants} plantas · actualizado hace pocos segundos`}
    >
      <section className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KpiCard
          tone="primary"
          label="Plantas online"
          value={`${summary.onlinePct.toFixed(1)}`}
          unit="%"
          delta={{ value: "vs 97.8 ayer", positive: true }}
        />
        <KpiCard
          tone="info"
          label="Generación ahora"
          value={summary.currentPowerMw.toFixed(2)}
          unit="MW"
        />
        <KpiCard
          tone="neutral"
          label="Energía hoy"
          value={summary.todayEnergyMwh.toFixed(1)}
          unit="MWh"
        />
        <KpiCard
          tone="warning"
          label="Alarmas activas"
          value={summary.activeAlarms}
        />
        <KpiCard
          tone="danger"
          label="En riesgo"
          value={summary.at_risk}
          unit="plantas"
        />
        <KpiCard
          tone="violet"
          label="Capacidad total"
          value={summary.capacityMw.toFixed(2)}
          unit="MW"
        />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <div>
              <h2 className="font-heading text-base font-semibold">Generación · últimas 24h</h2>
              <p className="text-xs text-slate-500">Desglose por proveedor</p>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700">
              Live
            </span>
          </div>
          <GenerationChart />
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-heading text-base font-semibold">Alarmas abiertas</h2>
            <Link href="/alarmas" className="text-xs font-medium text-emerald-700 hover:underline">
              Ver todas →
            </Link>
          </div>
          <ul className="space-y-2">
            {openAlarms.length === 0 ? (
              <li className="rounded-lg bg-emerald-50 px-3 py-4 text-sm text-emerald-700">
                Sin alarmas abiertas. Flota estable.
              </li>
            ) : (
              openAlarms.map((a) => (
                <li key={a.id} className="rounded-lg border border-slate-100 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="text-sm font-semibold">{a.message}</div>
                      <div className="text-xs text-slate-500">
                        {a.device.plant.name} · {a.device.plant.code}
                      </div>
                    </div>
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                        a.severity === "critical"
                          ? "bg-red-100 text-red-700"
                          : a.severity === "warning"
                            ? "bg-amber-100 text-amber-700"
                            : "bg-sky-100 text-sky-700"
                      }`}
                    >
                      {a.severity}
                    </span>
                  </div>
                </li>
              ))
            )}
          </ul>
        </div>
      </section>

      <FleetOverview topPlants={topPlants} />
    </AppShell>
  );
}
