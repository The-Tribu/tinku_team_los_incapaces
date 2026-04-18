import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ClienteDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const client = await prisma.client.findUnique({
    where: { id },
    include: {
      plants: {
        include: {
          devices: { select: { id: true, currentStatus: true, lastSeenAt: true } },
        },
      },
    },
  });
  if (!client) notFound();

  const deviceIds = client.plants.flatMap((p) => p.devices.map((d) => d.id));
  const [todayAgg, monthAgg] = await Promise.all([
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
  ]);
  const currentKw = todayAgg[0]?.power ?? 0;
  const todayKwh = todayAgg[0]?.energy ?? 0;
  const monthKwh = Math.max(0, monthAgg[0]?.energy ?? todayKwh * 30);
  const savingsCop = monthKwh * 680;
  const co2Ton = (monthKwh * 0.164) / 1000;
  const trees = Math.round(co2Ton * 46);

  const latestReport = await prisma.report.findFirst({
    where: { clientId: id },
    orderBy: { generatedAt: "desc" },
    include: { plant: { select: { name: true, code: true } } },
  });

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50">
      <div className="mx-auto max-w-md px-5 py-6">
        <Link href="/cliente" className="text-xs text-slate-500">
          ← cambiar empresa
        </Link>
        <div className="mt-2">
          <div className="text-xs uppercase tracking-wide text-emerald-700">tu planta solar</div>
          <h1 className="font-heading text-2xl font-bold text-slate-900">{client.name}</h1>
        </div>

        <div className="mt-6 rounded-3xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-6 text-white shadow-lg">
          <div className="text-xs font-medium uppercase opacity-80">Generando ahora</div>
          <div className="mt-1 font-heading text-5xl font-bold">
            {currentKw.toFixed(1)} <span className="text-xl opacity-70">kW</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-white/20 p-2.5">
              <div className="opacity-80">Energía hoy</div>
              <div className="mt-0.5 text-base font-bold">{todayKwh.toFixed(0)} kWh</div>
            </div>
            <div className="rounded-lg bg-white/20 p-2.5">
              <div className="opacity-80">Este mes</div>
              <div className="mt-0.5 text-base font-bold">{(monthKwh / 1000).toFixed(2)} MWh</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-emerald-200 bg-white p-5">
          <div className="text-xs font-semibold uppercase text-emerald-700">Tus ahorros este mes</div>
          <div className="mt-1 font-heading text-3xl font-bold text-slate-900">
            ${savingsCop.toLocaleString("es-CO")}
            <span className="ml-1 text-sm text-slate-500">COP</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
            <div>
              <div className="text-slate-500">CO₂ evitado</div>
              <div className="font-bold text-slate-900">{co2Ton.toFixed(2)} ton</div>
            </div>
            <div>
              <div className="text-slate-500">Equivalente</div>
              <div className="font-bold text-slate-900">≈ {trees} árboles 🌳</div>
            </div>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-heading text-sm font-semibold">Tus plantas</h2>
            <span className="text-xs text-slate-500">{client.plants.length} total</span>
          </div>
          <div className="mt-3 space-y-2">
            {client.plants.map((p) => {
              const online = p.devices.filter((d) => d.currentStatus === "online").length;
              const ok = online === p.devices.length && p.devices.length > 0;
              return (
                <div key={p.id} className="flex items-center justify-between rounded-lg border border-slate-100 bg-slate-50 p-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.name}</div>
                    <div className="text-xs text-slate-500">
                      {p.code} · {Number(p.capacityKwp ?? 0).toFixed(0)} kWp
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                      ok ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"
                    }`}
                  >
                    {ok ? "OK" : "revisar"}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {latestReport ? (
          <div className="mt-4 rounded-2xl border border-violet-200 bg-violet-50 p-5">
            <div className="text-xs font-semibold uppercase text-violet-700">Último reporte</div>
            <div className="mt-1 font-heading text-sm font-bold">
              {latestReport.plant?.name ?? "Flota"} ·{" "}
              {latestReport.period.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
            </div>
            <div className="mt-1 text-xs text-slate-600">
              Cumplimiento:{" "}
              <b className="text-slate-900">
                {latestReport.compliancePct ? Number(latestReport.compliancePct).toFixed(1) : "—"}%
              </b>
            </div>
          </div>
        ) : null}

        <div className="mt-6 pb-10 text-center text-[10px] text-slate-400">
          Powered by SunHub · Techos Rentables
        </div>
      </div>
    </div>
  );
}
