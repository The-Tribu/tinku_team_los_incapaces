"use client";
import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";

export type RemediationRow = {
  id: string;
  alarmId: string | null;
  deviceId: string;
  actionType: string;
  severity: string;
  reason: string;
  status: string;
  executionMode: string;
  attempt: number;
  triggeredBy: string;
  outcome: string | null;
  executedAt: string;
  verifiedAt: string | null;
  errorMessage: string | null;
  requestPayload: unknown;
  responseBody: unknown;
  device: {
    id: string;
    externalId: string;
    plant: { id: string; name: string; code: string };
    provider: { slug: string; displayName: string };
  };
  alarm: {
    id: string;
    type: string;
    severity: string;
    message: string;
    resolvedAt: string | null;
  } | null;
};

export type PolicyRow = {
  id: string;
  alarmType: string;
  providerSlug: string | null;
  actionType: string;
  maxSeverity: string;
  cooldownMin: number;
  maxAttempts: number;
  enabled: boolean;
  requiresHuman: boolean;
  requiresAiDecision: boolean;
};

const MODE_COPY: Record<string, { label: string; badge: string; blurb: string }> = {
  dry_run: {
    label: "SIMULADO",
    badge: "bg-amber-100 text-amber-800 border-amber-200",
    blurb:
      "Modo seguro: el agente construye la petición exacta a la API del proveedor pero NO la despacha. Ideal para el demo del hackathon porque el middleware aún no habilita escritura.",
  },
  shadow: {
    label: "SHADOW",
    badge: "bg-sky-100 text-sky-800 border-sky-200",
    blurb:
      "La petición se envía al middleware pero el sistema la trata como no aplicada. Útil para validar respuestas cuando se habilita escritura.",
  },
  live: {
    label: "PRODUCCIÓN",
    badge: "bg-emerald-100 text-emerald-800 border-emerald-200",
    blurb:
      "El agente despacha las peticiones y programa verificación a los 5 min. Requiere middleware con endpoints de escritura habilitados.",
  },
};

const STATUS_STYLE: Record<string, string> = {
  success: "bg-emerald-100 text-emerald-700",
  failed: "bg-red-100 text-red-700",
  executing: "bg-sky-100 text-sky-700",
  pending: "bg-slate-100 text-slate-600",
  skipped: "bg-slate-100 text-slate-500",
  escalated: "bg-amber-100 text-amber-800",
};

function statusLabel(s: string): { label: string; className: string } {
  if (s.startsWith("skipped")) return { label: s.replace("skipped_", "saltada · "), className: STATUS_STYLE.skipped };
  if (s.startsWith("escalated")) return { label: s.replace("escalated_", "escalada · "), className: STATUS_STYLE.escalated };
  return { label: s, className: STATUS_STYLE[s] ?? "bg-slate-100 text-slate-600" };
}

function fmtAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 1) return "recién";
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  return `hace ${Math.floor(h / 24)} d`;
}

function fmtClock(iso: string) {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}:${String(d.getSeconds()).padStart(2, "0")}`;
}

export function RemediationConsole({
  rows,
  policies,
  mode,
  aiEnabled,
}: {
  rows: RemediationRow[];
  policies: PolicyRow[];
  mode: string;
  aiEnabled: boolean;
}) {
  const modeCopy = MODE_COPY[mode] ?? MODE_COPY.dry_run;
  const [expanded, setExpanded] = useState<string | null>(null);
  const [tab, setTab] = useState<"logs" | "policies">("logs");

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-2xl border p-4 text-sm ${modeCopy.badge.replace(/\btext-[\w-]+\b/g, "").replace(/\bbg-[\w-]+\b/g, "bg-white")} border-slate-200`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${modeCopy.badge}`}>
            {modeCopy.label}
          </span>
          <span className="text-slate-700">
            REMEDIATION_MODE=<code className="font-mono text-slate-900">{mode}</code>
          </span>
          {aiEnabled ? (
            <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">
              Agente IA activo
            </span>
          ) : null}
        </div>
        <p className="mt-2 text-xs text-slate-600">{modeCopy.blurb}</p>
      </div>

      <div className="flex gap-2 text-xs">
        <button
          onClick={() => setTab("logs")}
          className={`rounded-md px-3 py-1.5 ${tab === "logs" ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
        >
          Historial de acciones ({rows.length})
        </button>
        <button
          onClick={() => setTab("policies")}
          className={`rounded-md px-3 py-1.5 ${tab === "policies" ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200"}`}
        >
          Políticas ({policies.length})
        </button>
      </div>

      {tab === "logs" ? (
        <LogsTable rows={rows} expanded={expanded} onExpand={setExpanded} />
      ) : (
        <PoliciesTable policies={policies} />
      )}
    </div>
  );
}

function LogsTable({
  rows,
  expanded,
  onExpand,
}: {
  rows: RemediationRow[];
  expanded: string | null;
  onExpand: (id: string | null) => void;
}) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Cuándo</th>
            <th className="px-4 py-3 font-medium">Planta / device</th>
            <th className="px-4 py-3 font-medium">Acción</th>
            <th className="px-4 py-3 font-medium">Modo</th>
            <th className="px-4 py-3 font-medium">Estado</th>
            <th className="px-4 py-3 font-medium">Resultado</th>
            <th className="px-4 py-3 font-medium text-right">—</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                Sin acciones de auto-reparación todavía. Cuando aparezca una alarma elegible, el agente la atenderá en el próximo tick del ingest.
              </td>
            </tr>
          ) : (
            rows.map((r) => {
              const s = statusLabel(r.status);
              const isExpanded = expanded === r.id;
              return (
                <Fragment key={r.id}>
                  <tr className="border-t border-slate-100 align-top">
                    <td className="px-4 py-3 text-xs text-slate-600">
                      <div suppressHydrationWarning>{fmtAgo(r.executedAt)}</div>
                      <div className="text-[10px] font-mono text-slate-400">{fmtClock(r.executedAt)}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-sm font-medium">{r.device.plant.name}</div>
                      <div className="text-[11px] font-mono text-slate-500">
                        {r.device.provider.slug}/{r.device.externalId}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-900">{r.actionType}</div>
                      <div className="text-[11px] text-slate-500">
                        intento #{r.attempt} · {r.triggeredBy}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                          MODE_COPY[r.executionMode]?.badge ?? "bg-slate-100 text-slate-600 border-slate-200"
                        }`}
                      >
                        {MODE_COPY[r.executionMode]?.label ?? r.executionMode}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${s.className}`}>
                        {s.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {r.outcome ? (
                        <span className="capitalize">{r.outcome.replace("_", " ")}</span>
                      ) : r.errorMessage ? (
                        <span className="text-red-700">{r.errorMessage.slice(0, 80)}</span>
                      ) : (
                        <span className="italic text-slate-400">pendiente</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => onExpand(isExpanded ? null : r.id)}
                        className="rounded-md border border-slate-200 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-50"
                      >
                        {isExpanded ? "Ocultar" : "Ver plan"}
                      </button>
                    </td>
                  </tr>
                  {isExpanded ? (
                    <tr className="border-t border-slate-100 bg-slate-50/60">
                      <td colSpan={7} className="px-4 py-3">
                        <div className="space-y-2 text-xs">
                          <div>
                            <span className="font-semibold">Razón:</span>{" "}
                            <span className="text-slate-700">{r.reason}</span>
                          </div>
                          {r.alarm ? (
                            <div>
                              <span className="font-semibold">Alarma origen:</span>{" "}
                              <span className="font-mono text-slate-700">{r.alarm.type}</span>{" "}
                              <span className="text-slate-500">· {r.alarm.message}</span>
                            </div>
                          ) : null}
                          <details>
                            <summary className="cursor-pointer font-semibold text-slate-700">
                              Petición construida (lo que se enviaría a la API del proveedor)
                            </summary>
                            <pre className="mt-1 max-h-[360px] overflow-auto rounded-md bg-slate-900 p-3 font-mono text-[11px] leading-5 text-emerald-200">
                              {JSON.stringify(r.requestPayload, null, 2)}
                            </pre>
                          </details>
                          {r.responseBody ? (
                            <details>
                              <summary className="cursor-pointer font-semibold text-slate-700">
                                Respuesta / log de pasos
                              </summary>
                              <pre className="mt-1 max-h-[260px] overflow-auto rounded-md bg-slate-100 p-3 font-mono text-[11px] leading-5 text-slate-700">
                                {JSON.stringify(r.responseBody, null, 2)}
                              </pre>
                            </details>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}

function PoliciesTable({ policies }: { policies: PolicyRow[] }) {
  const router = useRouter();
  const [busyId, setBusyId] = useState<string | null>(null);

  async function toggle(id: string, enabled: boolean) {
    setBusyId(id);
    await fetch(`/api/remediation/policies/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled }),
    });
    setBusyId(null);
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>
            <th className="px-4 py-3 font-medium">Alarma</th>
            <th className="px-4 py-3 font-medium">Proveedor</th>
            <th className="px-4 py-3 font-medium">Acción</th>
            <th className="px-4 py-3 font-medium">Max severidad</th>
            <th className="px-4 py-3 font-medium">Cooldown</th>
            <th className="px-4 py-3 font-medium">Max intentos</th>
            <th className="px-4 py-3 font-medium">Flags</th>
            <th className="px-4 py-3 font-medium text-right">Estado</th>
          </tr>
        </thead>
        <tbody>
          {policies.map((p) => (
            <tr key={p.id} className="border-t border-slate-100">
              <td className="px-4 py-3 font-mono text-xs">{p.alarmType}</td>
              <td className="px-4 py-3 text-xs text-slate-600">{p.providerSlug ?? "todos"}</td>
              <td className="px-4 py-3 font-mono text-xs">{p.actionType}</td>
              <td className="px-4 py-3 text-xs">{p.maxSeverity}</td>
              <td className="px-4 py-3 text-xs">{p.cooldownMin} min</td>
              <td className="px-4 py-3 text-xs">{p.maxAttempts}</td>
              <td className="px-4 py-3 text-xs space-x-1">
                {p.requiresHuman ? (
                  <span className="inline-flex rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-bold uppercase text-red-700">
                    humano
                  </span>
                ) : null}
                {p.requiresAiDecision ? (
                  <span className="inline-flex rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[10px] font-bold uppercase text-violet-700">
                    IA
                  </span>
                ) : null}
              </td>
              <td className="px-4 py-3 text-right">
                <button
                  disabled={busyId === p.id}
                  onClick={() => toggle(p.id, !p.enabled)}
                  className={`rounded-md px-2.5 py-1 text-xs font-medium ${
                    p.enabled
                      ? "bg-emerald-600 text-white hover:bg-emerald-700"
                      : "border border-slate-200 text-slate-600 hover:bg-slate-50"
                  } disabled:opacity-50`}
                >
                  {p.enabled ? "Activa" : "Deshabilitada"}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
