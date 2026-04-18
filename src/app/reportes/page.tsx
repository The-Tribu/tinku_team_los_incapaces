import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";
import { GenerateReportForm } from "./generate-form";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [plants, reports] = await Promise.all([
    prisma.plant.findMany({
      orderBy: { name: "asc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.report.findMany({
      take: 20,
      orderBy: { generatedAt: "desc" },
      include: {
        plant: { select: { name: true, code: true } },
        client: { select: { name: true } },
      },
    }),
  ]);

  return (
    <AppShell
      title="Reportes mensuales automatizados"
      subtitle="40 min/planta → <30 seg con SunHub"
    >
      <section className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-1">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="font-heading text-base font-semibold">Generar reporte</h2>
            <p className="mt-1 text-xs text-slate-500">
              Combina datos reales + narrativa IA en una sola tarjeta imprimible.
            </p>
            <GenerateReportForm
              plants={plants.map((p) => ({
                id: p.id,
                label: `${p.code} · ${p.name}`,
                client: p.client.name,
              }))}
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h2 className="mb-3 font-heading text-base font-semibold">Historial de reportes</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase text-slate-500">
                  <th className="pb-2 font-medium">Periodo</th>
                  <th className="pb-2 font-medium">Planta</th>
                  <th className="pb-2 font-medium">Cliente</th>
                  <th className="pb-2 font-medium text-right">Cumplimiento</th>
                  <th className="pb-2 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody>
                {reports.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-slate-500">
                      Aún no hay reportes. Genera el primero ↑
                    </td>
                  </tr>
                ) : (
                  reports.map((r) => (
                    <tr key={r.id} className="border-t border-slate-100">
                      <td className="py-2.5 text-sm">
                        {r.period.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}
                      </td>
                      <td className="py-2.5 text-sm">
                        {r.plant?.name ?? "—"}
                        <div className="font-mono text-xs text-slate-500">{r.plant?.code}</div>
                      </td>
                      <td className="py-2.5 text-sm text-slate-700">{r.client.name}</td>
                      <td className="py-2.5 text-right text-sm tabular-nums">
                        {r.compliancePct ? `${Number(r.compliancePct).toFixed(1)}%` : "—"}
                      </td>
                      <td className="py-2.5">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                            r.status === "sent"
                              ? "bg-emerald-100 text-emerald-700"
                              : r.status === "generating"
                                ? "bg-amber-100 text-amber-700"
                                : "bg-slate-100 text-slate-600"
                          }`}
                        >
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </AppShell>
  );
}
