import { notFound } from "next/navigation";
import { AppShell } from "@/components/sunhub/app-shell";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { StatusBadge } from "@/components/sunhub/status-badge";
import { prisma } from "@/lib/prisma";
import { AutoRemediationToggle } from "./auto-remediation-toggle";

export const dynamic = "force-dynamic";

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
        },
      },
      contracts: {
        orderBy: { periodMonth: "desc" },
        take: 1,
      },
    },
  });
  if (!plant) notFound();

  const lastReading = plant.devices[0]?.readings[0];
  const currentKw = plant.devices.reduce(
    (sum, d) => sum + Number(d.readings[0]?.powerAcKw ?? 0),
    0,
  );
  const capacity = Number(plant.capacityKwp ?? 0);
  const pr = capacity > 0 ? (currentKw / capacity) * 100 : 0;
  const todayEnergy = Number(lastReading?.energyKwh ?? 0);
  const contract = plant.contracts[0];
  const targetEnergy = Number(contract?.targetEnergyKwh ?? 0);
  const compliance = targetEnergy > 0 ? (todayEnergy * 30 / targetEnergy) * 100 : 0;

  return (
    <AppShell
      title={plant.name}
      subtitle={`${plant.code} · ${plant.client.name} · ${plant.location ?? ""}`}
    >
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard
          tone="primary"
          label="Potencia actual"
          value={currentKw.toFixed(1)}
          unit="kW"
        />
        <KpiCard
          tone="info"
          label="Performance Ratio"
          value={pr.toFixed(1)}
          unit="%"
        />
        <KpiCard
          tone="neutral"
          label="Energía hoy"
          value={todayEnergy.toFixed(1)}
          unit="kWh"
        />
        <KpiCard
          tone={compliance >= 95 ? "primary" : compliance >= 80 ? "warning" : "danger"}
          label="Cumplimiento proyectado"
          value={compliance.toFixed(1)}
          unit="%"
        />
      </section>

      <section className="mt-6 grid gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-base font-semibold">Dispositivos</h2>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="pb-2 font-medium">ID externo</th>
                <th className="pb-2 font-medium">Proveedor</th>
                <th className="pb-2 font-medium">Modelo</th>
                <th className="pb-2 font-medium text-right">Potencia</th>
                <th className="pb-2 font-medium">Estado</th>
              </tr>
            </thead>
            <tbody>
              {plant.devices.map((d) => (
                <tr key={d.id} className="border-t border-slate-100">
                  <td className="py-2 font-mono text-xs text-slate-500">{d.externalId}</td>
                  <td className="py-2 capitalize text-slate-700">{d.provider.slug}</td>
                  <td className="py-2 text-slate-700">{d.model ?? "—"}</td>
                  <td className="py-2 text-right tabular-nums">
                    {Number(d.readings[0]?.powerAcKw ?? 0).toFixed(1)} kW
                  </td>
                  <td className="py-2">
                    <StatusBadge status={d.currentStatus} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="font-heading text-base font-semibold">Contrato</h2>
          {contract ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-slate-500">Tipo</dt>
                <dd className="font-medium">{plant.contractType ?? "—"}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Periodo</dt>
                <dd className="font-medium">
                  {contract.periodMonth.toLocaleDateString("es-CO", {
                    month: "long",
                    year: "numeric",
                  })}
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Meta energía</dt>
                <dd className="font-medium">
                  {Number(contract.targetEnergyKwh).toLocaleString("es-CO")} kWh
                </dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Meta uptime</dt>
                <dd className="font-medium">{Number(contract.targetUptimePct).toFixed(1)}%</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-slate-500">Penalización</dt>
                <dd className="font-medium">
                  ${Number(contract.penaltyPerBreach).toLocaleString("es-CO")}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="mt-2 text-sm text-slate-500">Sin contrato definido.</p>
          )}
          <AutoRemediationToggle plantId={plant.id} initialEnabled={plant.autoRemediationEnabled} />
        </div>
      </section>
    </AppShell>
  );
}
