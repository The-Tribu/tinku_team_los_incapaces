import { AppShell } from "@/components/sunhub/app-shell";
import { BrandChip } from "@/components/sunhub/brand-chip";
import { prisma } from "@/lib/prisma";
import {
  Award,
  CircleDollarSign,
  Clock,
  Gauge,
  Hammer,
  Info,
  LineChart as LineChartIcon,
  ShieldCheck,
  Sparkles,
  Trophy,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";

type CatalogEntry = {
  capexPerKw: number;
  warrantyYears: number;
  apiCostMonth: number;
  efficiency: number;
  notes: string;
};

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

const CATALOG: Record<string, CatalogEntry> = {
  growatt: {
    capexPerKw: 2800,
    warrantyYears: 10,
    apiCostMonth: 0,
    efficiency: 0.975,
    notes: "Bueno para PYME. API pública.",
  },
  huawei: {
    capexPerKw: 4200,
    warrantyYears: 12,
    apiCostMonth: 0,
    efficiency: 0.985,
    notes: "Premium. Buen soporte FusionSolar.",
  },
  deye: {
    capexPerKw: 2600,
    warrantyYears: 10,
    apiCostMonth: 0,
    efficiency: 0.97,
    notes: "Económico. Fuerte en híbridos.",
  },
  hoymiles: {
    capexPerKw: 3200,
    warrantyYears: 12,
    apiCostMonth: 0,
    efficiency: 0.968,
    notes: "Microinversores. Menos pérdida por sombreado.",
  },
  srne: {
    capexPerKw: 2400,
    warrantyYears: 5,
    apiCostMonth: 0,
    efficiency: 0.96,
    notes: "Entry-level. Warranty corta.",
  },
  solarman: {
    capexPerKw: 2900,
    warrantyYears: 10,
    apiCostMonth: 50,
    efficiency: 0.972,
    notes: "Plataforma de monitoreo multi-marca.",
  },
};

const REFERENCE_KWP = 250;
const TARIFF_COP_PER_KWH = 700;
const PROJECTION_YEARS = 10;
const SUN_HOURS_DAY = 4.5;
const HEALTHY_PR = 0.8;
const OM_RATE = 0.015;

function scoreProvider(s: Omit<ProviderStats, "score">): number {
  const prScore = Math.min(1, s.avgPr / 85);
  const upScore = Math.min(1, s.avgUptime / 98);
  const alarmScore = Math.max(0, 1 - s.openAlarms / Math.max(1, s.devices));
  return Math.round((0.4 * prScore + 0.4 * upScore + 0.2 * alarmScore) * 100);
}

function projection(cat: CatalogEntry) {
  const capex = cat.capexPerKw * REFERENCE_KWP;
  const apiCost = cat.apiCostMonth * 12 * PROJECTION_YEARS;
  const om = capex * OM_RATE * PROJECTION_YEARS;
  const tco = capex + apiCost + om;
  const annualKwh = REFERENCE_KWP * SUN_HOURS_DAY * 365 * HEALTHY_PR * cat.efficiency;
  const annualRevenue = annualKwh * TARIFF_COP_PER_KWH;
  const revenue10y = annualRevenue * PROJECTION_YEARS;
  const netProfit = revenue10y - tco;
  const paybackYears = annualRevenue > 0 ? tco / annualRevenue : Infinity;
  const costPerKwh = annualKwh * PROJECTION_YEARS > 0 ? tco / (annualKwh * PROJECTION_YEARS) : 0;
  return { capex, apiCost, om, tco, annualKwh, annualRevenue, revenue10y, netProfit, paybackYears, costPerKwh };
}

function formatCOP(n: number): string {
  if (!Number.isFinite(n)) return "—";
  if (n >= 1_000_000_000) return `$${(n / 1_000_000_000).toFixed(2)} B`;
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)} K`;
  return `$${Math.round(n).toLocaleString("es-CO")}`;
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

  const bestScore = rows[0];
  const cheapestCapex = [...rows]
    .filter((r) => CATALOG[r.slug])
    .sort((a, b) => (CATALOG[a.slug]?.capexPerKw ?? 0) - (CATALOG[b.slug]?.capexPerKw ?? 0))[0];
  const bestPr = [...rows].sort((a, b) => b.avgPr - a.avgPr)[0];
  const mostInstalled = [...rows].sort((a, b) => b.capacityKwp - a.capacityKwp)[0];

  const maxCapex = Math.max(...rows.map((r) => CATALOG[r.slug]?.capexPerKw ?? 0), 1);
  const minCapex = Math.min(
    ...rows.filter((r) => CATALOG[r.slug]).map((r) => CATALOG[r.slug]!.capexPerKw),
    maxCapex,
  );

  const winner = bestScore && CATALOG[bestScore.slug] ? bestScore : null;
  const winnerProj = winner ? projection(CATALOG[winner.slug]!) : null;

  return (
    <AppShell
      title="Costo-beneficio por proveedor"
      subtitle="¿Qué marca conviene para la próxima planta? Datos reales de nuestra flota + catálogo."
    >
      {/* === Hero KPI strip === */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <KpiTile
          icon={<Trophy className="h-4 w-4" />}
          label="Mejor score"
          value={bestScore?.displayName ?? "—"}
          sub={bestScore ? `${bestScore.score}/100 puntos` : "—"}
          tone="emerald"
        />
        <KpiTile
          icon={<CircleDollarSign className="h-4 w-4" />}
          label="CAPEX más bajo"
          value={cheapestCapex?.displayName ?? "—"}
          sub={cheapestCapex ? `$${CATALOG[cheapestCapex.slug]?.capexPerKw.toLocaleString("es-CO")}/kW` : "—"}
          tone="amber"
        />
        <KpiTile
          icon={<Gauge className="h-4 w-4" />}
          label="Mejor PR 7d"
          value={bestPr?.displayName ?? "—"}
          sub={bestPr ? `${bestPr.avgPr.toFixed(1)}%` : "—"}
          tone="sky"
        />
        <KpiTile
          icon={<Zap className="h-4 w-4" />}
          label="Más capacidad instalada"
          value={mostInstalled?.displayName ?? "—"}
          sub={mostInstalled ? `${mostInstalled.capacityKwp.toFixed(0)} kWp · ${mostInstalled.plants} plantas` : "—"}
          tone="violet"
        />
      </div>

      {/* === Recommendation card === */}
      {winner && winnerProj ? (
        <div className="mt-6 overflow-hidden rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-600 via-emerald-700 to-emerald-800 text-white shadow-sm">
          <div className="grid gap-6 p-6 md:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-emerald-50 backdrop-blur">
                <Sparkles className="h-3.5 w-3.5" /> Recomendación SunHub
              </div>
              <h2 className="mt-3 font-heading text-3xl font-bold leading-tight">
                {winner.displayName} para una planta de {REFERENCE_KWP} kWp
              </h2>
              <p className="mt-2 text-sm text-emerald-50/90">
                {CATALOG[winner.slug]?.notes} Combina score {winner.score}/100 con CAPEX $
                {CATALOG[winner.slug]?.capexPerKw.toLocaleString("es-CO")}/kW y warranty{" "}
                {CATALOG[winner.slug]?.warrantyYears} años.
              </p>
              <div className="mt-5 grid grid-cols-3 gap-3">
                <InfoTile
                  label="TCO 10 años"
                  value={formatCOP(winnerProj.tco)}
                  sub={`${formatCOP(winnerProj.capex)} CAPEX + O&M`}
                />
                <InfoTile
                  label="Payback estimado"
                  value={`${winnerProj.paybackYears.toFixed(1)} años`}
                  sub={`con PR ${(HEALTHY_PR * 100).toFixed(0)}% saludable`}
                />
                <InfoTile
                  label="Costo por kWh"
                  value={`$${winnerProj.costPerKwh.toFixed(0)}`}
                  sub={`vs tarifa $${TARIFF_COP_PER_KWH} COP/kWh`}
                />
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-xl bg-white/10 p-5 backdrop-blur">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-100">
                  Proyección 10 años · {REFERENCE_KWP} kWp
                </div>
                <div className="mt-4 space-y-3">
                  <ProjRow label="CAPEX inicial" value={formatCOP(winnerProj.capex)} tone="light" />
                  <ProjRow label="O&M (1.5%/a)" value={formatCOP(winnerProj.om)} tone="light" />
                  <ProjRow label="API / monitoreo" value={formatCOP(winnerProj.apiCost)} tone="light" />
                  <div className="border-t border-white/20 pt-3">
                    <ProjRow label="Ingresos 10a" value={formatCOP(winnerProj.revenue10y)} tone="bold" />
                    <ProjRow label="Utilidad neta" value={formatCOP(winnerProj.netProfit)} tone="bold" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

      {/* === Detailed comparison table === */}
      <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="font-heading text-base font-semibold text-slate-900">Comparación detallada</h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Performance real de la flota + proyección financiera sobre {REFERENCE_KWP} kWp.
            </p>
          </div>
          <div className="flex flex-wrap gap-2 text-[11px]">
            <AssumptionChip icon={<Zap className="h-3 w-3" />} text={`${REFERENCE_KWP} kWp`} />
            <AssumptionChip icon={<Clock className="h-3 w-3" />} text={`${PROJECTION_YEARS} años`} />
            <AssumptionChip icon={<CircleDollarSign className="h-3 w-3" />} text={`${TARIFF_COP_PER_KWH} COP/kWh`} />
            <AssumptionChip icon={<Gauge className="h-3 w-3" />} text={`PR ${HEALTHY_PR * 100}%`} />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-[11px] uppercase tracking-wider text-slate-500">
                <th className="pb-3 font-semibold">Proveedor</th>
                <th className="pb-3 text-right font-semibold">Flota</th>
                <th className="pb-3 font-semibold">PR 7d</th>
                <th className="pb-3 font-semibold">Uptime 7d</th>
                <th className="pb-3 text-right font-semibold">Alarmas</th>
                <th className="pb-3 font-semibold">CAPEX/kW</th>
                <th className="pb-3 text-right font-semibold">TCO 10a</th>
                <th className="pb-3 text-right font-semibold">Payback</th>
                <th className="pb-3 text-right font-semibold">Score</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, idx) => {
                const cat = CATALOG[r.slug];
                const proj = cat ? projection(cat) : null;
                const capexRatio = cat ? (cat.capexPerKw - minCapex) / Math.max(1, maxCapex - minCapex) : 0;
                const alarmRate = r.devices > 0 ? r.openAlarms / r.devices : 0;
                return (
                  <tr key={r.slug} className="border-b border-slate-100 last:border-b-0 hover:bg-slate-50/60">
                    <td className="py-4">
                      <div className="flex items-center gap-2">
                        {idx === 0 ? (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm">
                            <Award className="h-3.5 w-3.5" />
                          </span>
                        ) : (
                          <span className="flex h-6 w-6 shrink-0 items-center justify-center text-[11px] font-semibold text-slate-400">
                            #{idx + 1}
                          </span>
                        )}
                        <BrandChip slug={r.slug} size="sm" />
                        <span className="text-xs text-slate-500">warranty {cat?.warrantyYears ?? "—"}a</span>
                      </div>
                    </td>
                    <td className="py-4 text-right tabular-nums">
                      <div className="text-sm font-semibold text-slate-900">{r.plants} <span className="text-xs font-normal text-slate-400">plantas</span></div>
                      <div className="text-[11px] text-slate-500">{r.capacityKwp.toFixed(0)} kWp</div>
                    </td>
                    <td className="py-4">
                      <MiniBar value={r.avgPr} max={100} tone={r.avgPr >= 75 ? "emerald" : r.avgPr >= 50 ? "amber" : "rose"} label={`${r.avgPr.toFixed(1)}%`} />
                    </td>
                    <td className="py-4">
                      <MiniBar value={r.avgUptime} max={100} tone={r.avgUptime >= 95 ? "emerald" : r.avgUptime >= 70 ? "amber" : "rose"} label={`${r.avgUptime.toFixed(1)}%`} />
                    </td>
                    <td className="py-4 text-right">
                      <div className="flex items-center justify-end gap-1 text-sm font-semibold tabular-nums text-slate-900">
                        {r.openAlarms}
                      </div>
                      <div className={`text-[11px] ${alarmRate > 1 ? "text-rose-600" : alarmRate > 0.3 ? "text-amber-600" : "text-slate-500"}`}>
                        {alarmRate.toFixed(2)}/dispositivo
                      </div>
                    </td>
                    <td className="py-4">
                      {cat ? (
                        <div className="min-w-[110px]">
                          <div className="font-mono text-xs font-semibold text-slate-900">
                            ${cat.capexPerKw.toLocaleString("es-CO")}
                          </div>
                          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className={`h-full rounded-full ${
                                capexRatio < 0.33
                                  ? "bg-emerald-500"
                                  : capexRatio < 0.66
                                    ? "bg-amber-500"
                                    : "bg-rose-500"
                              }`}
                              style={{ width: `${Math.max(12, capexRatio * 100)}%` }}
                            />
                          </div>
                        </div>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-4 text-right">
                      {proj ? (
                        <>
                          <div className="text-sm font-semibold tabular-nums text-slate-900">{formatCOP(proj.tco)}</div>
                          <div className="text-[11px] text-slate-500">${proj.costPerKwh.toFixed(0)} / kWh gen.</div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-4 text-right">
                      {proj ? (
                        <>
                          <div className="text-sm font-semibold tabular-nums text-slate-900">
                            {proj.paybackYears.toFixed(1)}a
                          </div>
                          <div className="text-[11px] text-emerald-700">+{formatCOP(proj.netProfit)}</div>
                        </>
                      ) : (
                        <span className="text-xs text-slate-400">—</span>
                      )}
                    </td>
                    <td className="py-4 pl-3 text-right">
                      <ScoreBadge score={r.score} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {rows.some((r) => !CATALOG[r.slug]) ? (
          <div className="mt-3 text-[11px] text-slate-400">
            — Algunos proveedores no tienen ficha en el catálogo de referencia.
          </div>
        ) : null}
      </div>

      {/* === Methodology & assumptions === */}
      <div className="mt-6 grid gap-4 md:grid-cols-2">
        <InfoCard
          icon={<LineChartIcon className="h-4 w-4" />}
          title="Metodología del score"
          tone="sky"
          body={
            <>
              <span className="font-semibold text-sky-900">Score</span> = 40% PR 7d + 40% uptime 7d +
              20% (1 − alarmas/dispositivo). Se calcula cada 5 min con datos normalizados por el
              middleware SunHub.
            </>
          }
        />
        <InfoCard
          icon={<Hammer className="h-4 w-4" />}
          title="Supuestos de la proyección"
          tone="amber"
          body={
            <ul className="space-y-1">
              <li>· {REFERENCE_KWP} kWp instalados · {PROJECTION_YEARS} años de operación.</li>
              <li>· Tarifa promedio $ {TARIFF_COP_PER_KWH.toLocaleString("es-CO")} COP/kWh (industrial).</li>
              <li>· PR saludable {(HEALTHY_PR * 100).toFixed(0)}% · {SUN_HOURS_DAY} HSP/día.</li>
              <li>· O&M {(OM_RATE * 100).toFixed(1)}%/año del CAPEX.</li>
            </ul>
          }
        />
        <InfoCard
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Qué NO cubre"
          tone="slate"
          body={
            <>
              No incluye impuestos, tasa de cambio, degradación de paneles ({"<"}0.5%/a) ni seguros.
              El puntaje ignora el costo inicial — revísalo junto al CAPEX y TCO.
            </>
          }
        />
        <InfoCard
          icon={<Info className="h-4 w-4" />}
          title="Lectura rápida"
          tone="emerald"
          body={
            <>
              Un proveedor con score alto pero CAPEX elevado puede ser la mejor apuesta a largo plazo
              si el payback es corto. Prioriza el <b>costo por kWh generado</b>, no solo el precio de
              compra.
            </>
          }
        />
      </div>
    </AppShell>
  );
}

function KpiTile({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "amber" | "sky" | "violet";
}) {
  const styles: Record<string, { bg: string; text: string; ring: string }> = {
    emerald: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-100" },
    amber: { bg: "bg-amber-50", text: "text-amber-700", ring: "ring-amber-100" },
    sky: { bg: "bg-sky-50", text: "text-sky-700", ring: "ring-sky-100" },
    violet: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-100" },
  };
  const s = styles[tone];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-3">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ring-1 ${s.bg} ${s.text} ${s.ring}`}>
          {icon}
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
          <div className="truncate font-heading text-base font-bold text-slate-900">{value}</div>
        </div>
      </div>
      <div className="mt-2 text-xs text-slate-600">{sub}</div>
    </div>
  );
}

function InfoTile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-emerald-100">{label}</div>
      <div className="mt-0.5 font-heading text-xl font-bold text-white">{value}</div>
      <div className="text-[11px] text-emerald-50/80">{sub}</div>
    </div>
  );
}

function ProjRow({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "light" | "bold";
}) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className={tone === "bold" ? "text-emerald-50" : "text-emerald-100/80"}>{label}</span>
      <span className={tone === "bold" ? "font-heading text-base font-bold text-white" : "font-medium text-white"}>
        {value}
      </span>
    </div>
  );
}

function AssumptionChip({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 font-medium text-slate-600">
      <span className="text-slate-400">{icon}</span>
      {text}
    </span>
  );
}

function MiniBar({
  value,
  max,
  tone,
  label,
}: {
  value: number;
  max: number;
  tone: "emerald" | "amber" | "rose";
  label: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const barColor = {
    emerald: "bg-emerald-500",
    amber: "bg-amber-500",
    rose: "bg-rose-500",
  }[tone];
  const textColor = {
    emerald: "text-emerald-700",
    amber: "text-amber-700",
    rose: "text-rose-700",
  }[tone];
  return (
    <div className="min-w-[90px]">
      <div className={`text-xs font-semibold tabular-nums ${textColor}`}>{label}</div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${Math.max(3, pct)}%` }} />
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  const tone =
    score >= 80
      ? { text: "text-emerald-700", bg: "bg-emerald-100", ring: "ring-emerald-200" }
      : score >= 60
        ? { text: "text-amber-700", bg: "bg-amber-100", ring: "ring-amber-200" }
        : { text: "text-rose-700", bg: "bg-rose-100", ring: "ring-rose-200" };
  const pct = Math.max(0, Math.min(100, score));
  return (
    <div className="flex flex-col items-end gap-1">
      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-bold ring-1 ${tone.bg} ${tone.text} ${tone.ring}`}>
        {score}/100
      </span>
      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100">
        <div
          className={`h-full rounded-full ${
            score >= 80 ? "bg-emerald-500" : score >= 60 ? "bg-amber-500" : "bg-rose-500"
          }`}
          style={{ width: `${Math.max(3, pct)}%` }}
        />
      </div>
    </div>
  );
}

function InfoCard({
  icon,
  title,
  body,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  body: React.ReactNode;
  tone: "sky" | "amber" | "slate" | "emerald";
}) {
  const styles: Record<string, { bg: string; border: string; text: string; title: string }> = {
    sky: { bg: "bg-sky-50", border: "border-sky-200", text: "text-sky-900/80", title: "text-sky-900" },
    amber: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-900/80", title: "text-amber-900" },
    slate: { bg: "bg-slate-50", border: "border-slate-200", text: "text-slate-700", title: "text-slate-900" },
    emerald: { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-900/80", title: "text-emerald-900" },
  };
  const s = styles[tone];
  return (
    <div className={`rounded-2xl border ${s.border} ${s.bg} p-5`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-7 w-7 items-center justify-center rounded-lg bg-white/70 ${s.title}`}>{icon}</span>
        <h4 className={`font-heading text-sm font-semibold ${s.title}`}>{title}</h4>
      </div>
      <div className={`mt-2 text-xs leading-relaxed ${s.text}`}>{body}</div>
    </div>
  );
}
