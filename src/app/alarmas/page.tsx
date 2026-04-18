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

  const [alarms, countOpen, countCritical, policies] = await Promise.all([
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
        remediations: {
          take: 1,
          orderBy: { executedAt: "desc" },
          select: {
            id: true,
            executedAt: true,
            status: true,
            executionMode: true,
            outcome: true,
            actionType: true,
          },
        },
      },
    }),
    prisma.alarm.count({ where: { resolvedAt: null } }),
    prisma.alarm.count({ where: { resolvedAt: null, severity: "critical" } }),
    prisma.remediationPolicy.findMany({ where: { enabled: true } }),
  ]);

  const policyIndex = new Map<string, { requiresHuman: boolean }>();
  for (const p of policies) {
    const k = `${p.alarmType}|${p.providerSlug ?? "*"}`;
    policyIndex.set(k, { requiresHuman: p.requiresHuman });
  }
  function resolvePolicy(alarmType: string, providerSlug: string) {
    return (
      policyIndex.get(`${alarmType}|${providerSlug}`) ??
      policyIndex.get(`${alarmType}|*`) ??
      null
    );
  }

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
              alarms.map((a) => {
                const policy = resolvePolicy(a.type, a.device.provider.slug);
                const last = a.remediations[0];
                return (
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
                    autoRemediable={policy !== null && !policy.requiresHuman}
                    requiresHuman={a.requiresHuman || (policy?.requiresHuman ?? false)}
                    recentRemediation={
                      last
                        ? {
                            id: last.id,
                            executedAt: last.executedAt.toISOString(),
                            status: last.status,
                            executionMode: last.executionMode,
                            outcome: last.outcome,
                            actionType: last.actionType,
                          }
                        : null
                    }
                  />
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
