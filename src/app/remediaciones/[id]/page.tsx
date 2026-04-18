import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, BadgeCheck, Brain, Clock, ListChecks } from "lucide-react";
import { AppShell } from "@/components/sunhub/app-shell";
import { canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getCommand } from "@/lib/commands";
import { RemediationDetailActions } from "./detail-actions";

export const dynamic = "force-dynamic";

const eventLabel: Record<string, string> = {
  proposed: "Propuesta",
  approved: "Aprobada",
  executed: "Ejecutada",
  verified: "Verificada",
  failed: "Fallida",
  rejected: "Rechazada",
  cancelled: "Cancelada",
};

const eventColor: Record<string, string> = {
  proposed: "bg-amber-100 text-amber-700",
  approved: "bg-sky-100 text-sky-700",
  executed: "bg-emerald-100 text-emerald-700",
  verified: "bg-emerald-100 text-emerald-700",
  failed: "bg-rose-100 text-rose-700",
  rejected: "bg-slate-200 text-slate-700",
  cancelled: "bg-slate-200 text-slate-700",
};

export default async function RemediationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canWrite(me)) redirect("/dashboard");

  const { id } = await params;
  const row = await prisma.remediation.findUnique({
    where: { id },
    include: {
      plant: { select: { id: true, name: true, code: true } },
      device: { select: { externalId: true, kind: true, provider: { select: { slug: true } } } },
      audit: { orderBy: { createdAt: "desc" } },
      alarm: { select: { id: true, type: true, severity: true, message: true, resolvedAt: true } },
      prediction: {
        select: { id: true, predictedType: true, probability: true, rootCause: true, suggestedAction: true },
      },
    },
  });
  if (!row) notFound();

  const agentDecision = await prisma.agentDecision.findFirst({
    where: { remediationId: id },
    orderBy: { createdAt: "desc" },
  });

  const cmd = getCommand(row.commandType);

  return (
    <AppShell
      title={`Remediación · ${cmd?.label ?? row.commandType}`}
      subtitle={`${row.plant.name} (${row.plant.code}) · ${row.device?.externalId ?? "sin device"}`}
      actions={
        <Link
          href="/remediaciones"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          <ArrowLeft className="h-3 w-3" /> Bandeja
        </Link>
      }
    >
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-[11px] uppercase text-slate-500">Comando</div>
                <div className="mt-1 font-mono text-sm text-slate-900">{row.commandType}</div>
                {cmd ? (
                  <div className="mt-1 text-xs text-slate-500">{cmd.description}</div>
                ) : null}
              </div>
              <div className="flex flex-col items-end gap-1">
                <span
                  className={
                    "rounded px-2 py-0.5 text-[11px] font-medium " +
                    (eventColor[row.status] ?? "bg-slate-100 text-slate-700")
                  }
                >
                  {row.status}
                </span>
                <span className="rounded px-2 py-0.5 text-[11px] font-medium ring-1 ring-slate-200 bg-white text-slate-600">
                  modo {row.executionMode}
                </span>
              </div>
            </div>
            <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-700">
              {row.reason}
            </div>
            <RemediationDetailActions
              id={row.id}
              status={row.status}
              verifiedOutcome={row.verifiedOutcome}
              canApprove={me.role === "admin" || me.role === "ops"}
            />
          </section>

          {agentDecision ? (
            <section className="rounded-2xl border border-violet-200 bg-violet-50/40 p-5 shadow-sm">
              <div className="flex items-center gap-2 text-violet-900">
                <Brain className="h-4 w-4" />
                <h3 className="font-heading text-sm font-semibold">Decisión del agente</h3>
              </div>
              <div className="mt-2 grid gap-2 text-xs text-slate-700">
                <div>
                  <b>Acción:</b> {agentDecision.action}
                  {agentDecision.commandId ? ` → ${agentDecision.commandId}` : ""}
                </div>
                <div>
                  <b>Confianza:</b>{" "}
                  {agentDecision.confidence
                    ? `${(Number(agentDecision.confidence) * 100).toFixed(0)}%`
                    : "n/d"}{" "}
                  · <b>LLM:</b> {agentDecision.llmUsed ? "sí" : "no"} ·{" "}
                  <b>Modelo:</b> {agentDecision.modelVersion ?? "—"}
                </div>
                <div className="rounded bg-white/70 p-3 italic text-slate-700">
                  {agentDecision.rationale}
                </div>
              </div>
            </section>
          ) : null}

          {row.alarm ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-heading text-sm font-semibold">Alarma origen</h3>
              <div className="mt-2 text-sm">
                <span className="rounded px-1.5 py-0.5 text-[11px] font-medium bg-slate-100 text-slate-700">
                  {row.alarm.severity}
                </span>{" "}
                <span className="font-mono text-xs">{row.alarm.type}</span>
                {row.alarm.resolvedAt ? (
                  <span className="ml-2 rounded bg-emerald-100 px-1.5 py-0.5 text-[11px] text-emerald-800">
                    resuelta
                  </span>
                ) : (
                  <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-800">
                    activa
                  </span>
                )}
              </div>
              <div className="mt-2 text-xs text-slate-600">{row.alarm.message}</div>
              <Link
                href={`/alarmas?focus=${row.alarm.id}`}
                className="mt-2 inline-block text-xs text-sky-700 hover:underline"
              >
                Ver alarma →
              </Link>
            </section>
          ) : null}

          {row.prediction ? (
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="font-heading text-sm font-semibold">Predicción asociada</h3>
              <div className="mt-2 text-xs text-slate-600">
                <b>{row.prediction.predictedType}</b> ·{" "}
                {Math.round(Number(row.prediction.probability) * 100)}% de probabilidad
              </div>
              {row.prediction.rootCause ? (
                <div className="mt-2 rounded bg-slate-50 p-3 text-xs text-slate-700">
                  {row.prediction.rootCause}
                </div>
              ) : null}
            </section>
          ) : null}

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <ListChecks className="h-4 w-4 text-slate-500" />
              <h3 className="font-heading text-sm font-semibold">Payload del comando</h3>
            </div>
            <pre className="mt-2 overflow-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">
{JSON.stringify(row.commandPayload, null, 2)}
            </pre>
            {row.executionResult ? (
              <>
                <div className="mt-3 text-xs font-medium text-slate-700">Respuesta de ejecución</div>
                <pre className="mt-1 overflow-auto rounded bg-slate-900 p-3 text-[11px] text-slate-100">
{JSON.stringify(row.executionResult, null, 2)}
                </pre>
              </>
            ) : null}
          </section>
        </div>

        <aside className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-4 w-4 text-slate-500" />
              <h3 className="font-heading text-sm font-semibold">Datos clave</h3>
            </div>
            <dl className="mt-3 space-y-1.5 text-xs">
              <Row label="Planta" value={`${row.plant.name} (${row.plant.code})`} />
              <Row
                label="Dispositivo"
                value={row.device ? `${row.device.externalId} · ${row.device.kind}` : "—"}
              />
              <Row label="Proveedor" value={row.device?.provider.slug ?? "—"} />
              <Row label="Propuso" value={row.proposedBy} />
              <Row
                label="Confianza IA"
                value={row.aiConfidence ? `${(Number(row.aiConfidence) * 100).toFixed(0)}%` : "—"}
              />
              <Row label="Reintentos" value={String(row.retryCount)} />
              <Row
                label="Próximo retry"
                value={row.nextRetryAt ? new Date(row.nextRetryAt).toLocaleString("es-CO") : "—"}
              />
              <Row label="Order ID provider" value={row.providerOrderId ?? "—"} />
              <Row
                label="Verificada"
                value={row.verifiedAt ? new Date(row.verifiedAt).toLocaleString("es-CO") : "—"}
              />
              <Row label="Resultado" value={row.verifiedOutcome ?? "—"} />
            </dl>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <h3 className="font-heading text-sm font-semibold">Línea de tiempo</h3>
            </div>
            <ul className="mt-3 space-y-3">
              {row.audit.length === 0 ? (
                <li className="text-xs text-slate-500">Sin eventos.</li>
              ) : (
                row.audit.map((ev) => {
                  const payload = ev.payload as Record<string, unknown> | null;
                  return (
                    <li key={ev.id} className="border-l-2 border-slate-200 pl-3">
                      <div className="flex items-center gap-2 text-xs">
                        <span
                          className={
                            "rounded px-1.5 py-0.5 text-[11px] font-medium " +
                            (eventColor[ev.event] ?? "bg-slate-100 text-slate-700")
                          }
                        >
                          {eventLabel[ev.event] ?? ev.event}
                        </span>
                        <span className="text-[11px] text-slate-500">
                          {new Date(ev.createdAt).toLocaleString("es-CO")}
                        </span>
                        <span className="ml-auto text-[10px] uppercase text-slate-400">
                          {ev.actorKind}
                        </span>
                      </div>
                      {payload ? (
                        <pre className="mt-1 overflow-auto rounded bg-slate-50 p-2 text-[10px] text-slate-700">
{JSON.stringify(payload, null, 2)}
                        </pre>
                      ) : null}
                    </li>
                  );
                })
              )}
            </ul>
          </section>
        </aside>
      </div>
    </AppShell>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="shrink-0 text-slate-500">{label}</dt>
      <dd className="text-right font-medium text-slate-800">{value}</dd>
    </div>
  );
}
