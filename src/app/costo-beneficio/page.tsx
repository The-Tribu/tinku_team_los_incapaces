import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

type ProviderStats = {
  slug: string;
  displayName: string;
  plants: number;
  devices: number;
  avgPr: number;
  avgUptime: number;
  openAlarms: number;
  capacityKwp: number;
  energyTotalKwh: number;
  score: number;
};

const CATALOG: Record<
  string,
  { capexPerKw: number; warrantyYears: number; apiCostMonth: number; notes: string }
> = {
  growatt: { capexPerKw: 2800, warrantyYears: 10, apiCostMonth: 0, notes: "Bueno para PYME. API pública." },
  huawei: { capexPerKw: 4200, warrantyYears: 12, apiCostMonth: 0, notes: "Premium. Buen soporte FusionSolar." },
  deye: { capexPerKw: 2600, warrantyYears: 10, apiCostMonth: 0, notes: "Económico. Fuerte en híbridos." },
  hoymiles: { capexPerKw: 3200, warrantyYears: 12, apiCostMonth: 0, notes: "Microinversores. Menos sombreado." },
  srne: { capexPerKw: 2400, warrantyYears: 5, apiCostMonth: 0, notes: "Entry-level. Warranty corta." },
  solarman: { capexPerKw: 2900, warrantyYears: 10, apiCostMonth: 50, notes: "Plataforma de monitoreo multi-marca." },
};

function scoreProvider(s: Omit<ProviderStats, "score">): number {
  const prScore = Math.min(1, s.avgPr / 85);
  const upScore = Math.min(1, s.avgUptime / 98);
  const alarmScore = Math.max(0, 1 - s.openAlarms / Math.max(1, s.devices));
  return Math.round((0.4 * prScore + 0.4 * upScore + 0.2 * alarmScore) * 100);
}

export default async function CostoBeneficioPage() {
  const providers = await prisma.provider.findMany({
    include: {
      devices: {
        include: {
          plant: { select: { capacityKwp: true, id: true } },
          alarms: { where: { resolvedAt: null }, select: { id: true } },
        },
      },
    },
  });

  const rows: ProviderStats[] = await Promise.all(
    providers.map(async (prov) => {
      const deviceIds = prov.devices.map((d) => d.id);
      const plantIds = Array.from(new Set(prov.devices.map((d) => d.plantId)));
      const capacity = Array.from(
        new Map(prov.devices.map((d) => [d.plantId, Number(d.plant.capacityKwp ?? 0)])).values(),
      ).reduce((s, v) => s + v, 0);

      let avgPr = 0;
      let avgUptime = 0;
      let energy = 0;
      if (deviceIds.length > 0) {
        const agg = await prisma.$queryRaw<
          Array<{ avg_power: number; samples: number; online: number; energy: number }>
        >`
          SELECT COALESCE(AVG(r.power_ac_kw), 0)::float   AS avg_power,
                 COUNT(*)::int                             AS samples,
                 COUNT(*) FILTER (WHERE r.power_ac_kw > 0)::int AS online,
                 COALESCE(SUM(r.energy_kwh), 0)::float    AS energy
          FROM readings r
          WHERE r.device_id = ANY(${deviceIds}::uuid[])
            AND r.ts >= now() - interval '7 days'
        `;
        const a = agg[0];
        const avgPower = a?.avg_power ?? 0;
        avgPr = capacity > 0 ? (avgPower / capacity) * 100 : 0;
        avgUptime = a && a.samples > 0 ? (a.online / a.samples) * 100 : 0;
        energy = a?.energy ?? 0;
      }

      const openAlarms = prov.devices.reduce((s, d) => s + d.alarms.length, 0);
      const base: Omit<ProviderStats, "score"> = {
        slug: prov.slug,
        displayName: prov.displayName,
        plants: plantIds.length,
        devices: prov.devices.length,
        avgPr,
        avgUptime,
        openAlarms,
        capacityKwp: capacity,
        energyTotalKwh: energy,
      };
      return { ...base, score: scoreProvider(base) };
    }),
  );

  rows.sort((a, b) => b.score - a.score);

  return (
    <AppShell
      title="Costo-beneficio por proveedor"
      subtitle="¿Qué marca conviene para la próxima planta? Datos reales de nuestra flota + catálogo."
    >
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="pb-3 font-medium">Proveedor</th>
              <th className="pb-3 font-medium text-right">Plantas</th>
              <th className="pb-3 font-medium text-right">Capacidad</th>
              <th className="pb-3 font-medium text-right">PR 7d</th>
              <th className="pb-3 font-medium text-right">Uptime 7d</th>
              <th className="pb-3 font-medium text-right">Alarmas</th>
              <th className="pb-3 font-medium text-right">Score</th>
              <th className="pb-3 font-medium">Ficha</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const cat = CATALOG[r.slug];
              return (
                <tr key={r.slug} className="border-t border-slate-100">
                  <td className="py-3 font-medium capitalize">{r.displayName}</td>
                  <td className="py-3 text-right tabular-nums">{r.plants}</td>
                  <td className="py-3 text-right tabular-nums">{r.capacityKwp.toFixed(0)} kWp</td>
                  <td className="py-3 text-right tabular-nums">{r.avgPr.toFixed(1)}%</td>
                  <td className="py-3 text-right tabular-nums">{r.avgUptime.toFixed(1)}%</td>
                  <td className="py-3 text-right tabular-nums">{r.openAlarms}</td>
                  <td className="py-3 text-right">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                        r.score >= 80
                          ? "bg-emerald-100 text-emerald-700"
                          : r.score >= 60
                            ? "bg-amber-100 text-amber-700"
                            : "bg-red-100 text-red-700"
                      }`}
                    >
                      {r.score}/100
                    </span>
                  </td>
                  <td className="py-3 text-xs text-slate-600">
                    {cat ? (
                      <div>
                        <div className="font-mono">${cat.capexPerKw.toLocaleString("es-CO")}/kW · {cat.warrantyYears}a</div>
                        <div className="text-slate-500">{cat.notes}</div>
                      </div>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-slate-700">
        <div className="font-semibold text-sky-800">Metodología</div>
        <p className="mt-1 text-xs">
          Score = 40% PR (performance ratio 7d) + 40% uptime 7d + 20% (1 − alarmas/dispositivo). CAPEX
          de referencia promedio en Colombia para instalación industrial 100–1000 kWp. Warranty
          típico del inversor.
        </p>
      </div>
    </AppShell>
  );
}
