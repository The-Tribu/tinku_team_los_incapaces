import Link from "next/link";
import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";
import { AlarmRow } from "./alarm-row";

export const dynamic = "force-dynamic";

export default async function AlarmsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  const sp = await searchParams;
  const where: Record<string, unknown> = {};
  if (sp.status === "open") where.resolvedAt = null;
  if (sp.status === "resolved") where.resolvedAt = { not: null };
  if (sp.severity) where.severity = sp.severity;

  const [alarms, countOpen, countCritical] = await Promise.all([
    prisma.alarm.findMany({
      where,
      take: 100,
      orderBy: [{ severity: "asc" }, { startedAt: "desc" }],
      include: {
        device: {
          include: {
            plant: { select: { id: true, name: true, code: true } },
            provider: { select: { slug: true } },
          },
        },
      },
    }),
    prisma.alarm.count({ where: { resolvedAt: null } }),
    prisma.alarm.count({ where: { resolvedAt: null, severity: "critical" } }),
  ]);

  return (
    <AppShell
      title="Centro de Alarmas"
      subtitle={`${countOpen} abiertas · ${countCritical} críticas`}
    >
      <section className="mb-4 flex flex-wrap gap-2 text-xs">
        <Link
          href="/alarmas?status=open"
          className={`rounded-md px-3 py-1.5 ${sp.status === "open" || !sp.status ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
        >
          Abiertas
        </Link>
        <Link
          href="/alarmas?status=resolved"
          className={`rounded-md px-3 py-1.5 ${sp.status === "resolved" ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"}`}
        >
          Resueltas
        </Link>
        <div className="ml-4 flex items-center gap-1">
          <span className="text-slate-500">Severidad:</span>
          {["critical", "warning", "info"].map((sev) => (
            <Link
              key={sev}
              href={`/alarmas?severity=${sev}${sp.status ? `&status=${sp.status}` : ""}`}
              className={`rounded-md px-2.5 py-1 capitalize ${
                sp.severity === sev
                  ? "bg-slate-900 text-white"
                  : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {sev}
            </Link>
          ))}
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Severidad</th>
              <th className="px-4 py-3 font-medium">Alarma</th>
              <th className="px-4 py-3 font-medium">Planta</th>
              <th className="px-4 py-3 font-medium">Inició</th>
              <th className="px-4 py-3 font-medium">Sugerencia IA</th>
              <th className="px-4 py-3 font-medium text-right">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {alarms.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-500">
                  Sin alarmas que coincidan con el filtro.
                </td>
              </tr>
            ) : (
              alarms.map((a) => (
                <AlarmRow
                  key={a.id}
                  id={a.id}
                  severity={a.severity}
                  message={a.message}
                  plantName={a.device.plant.name}
                  plantCode={a.device.plant.code}
                  plantId={a.device.plant.id}
                  provider={a.device.provider.slug}
                  startedAt={a.startedAt.toISOString()}
                  resolvedAt={a.resolvedAt?.toISOString() ?? null}
                  aiSuggestion={a.aiSuggestion}
                  assignee={a.assignee}
                />
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
