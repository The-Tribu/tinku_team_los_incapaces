"use client";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { useState, useTransition } from "react";
import {
  CheckCircle2,
  ChevronRight,
  Loader2,
  Play,
  RefreshCcw,
  ShieldCheck,
  XCircle,
} from "lucide-react";

type RemediationItem = {
  id: string;
  plantId: string;
  plantName: string;
  plantCode: string;
  clientLabel: string;
  deviceExternalId: string | null;
  providerSlug: string | null;
  commandType: string;
  reason: string;
  status: string;
  executionMode: string;
  proposedBy: string;
  proposedAt: string;
  executedAt: string | null;
  verifiedOutcome: string | null;
  aiConfidence: number | null;
  retryCount: number;
  nextRetryAt: string | null;
  alarm: { id: string; type: string; severity: string } | null;
};

type PlantOption = {
  id: string;
  name: string;
  code: string;
  clientLabel: string;
};

const STATUS_TABS: Array<{ value: string; label: string; color: string }> = [
  { value: "proposed", label: "Propuestas", color: "amber" },
  { value: "approved", label: "Aprobadas", color: "sky" },
  { value: "executed", label: "Ejecutadas", color: "emerald" },
  { value: "verified", label: "Verificadas", color: "emerald" },
  { value: "failed", label: "Fallidas", color: "rose" },
  { value: "cancelled", label: "Canceladas", color: "slate" },
];

function severityBadge(sev: string) {
  if (sev === "critical") return "bg-rose-100 text-rose-700";
  if (sev === "warning") return "bg-amber-100 text-amber-700";
  return "bg-slate-100 text-slate-600";
}

function statusBadge(status: string) {
  switch (status) {
    case "proposed":
      return "bg-amber-100 text-amber-700";
    case "approved":
      return "bg-sky-100 text-sky-700";
    case "executing":
      return "bg-sky-100 text-sky-700";
    case "executed":
      return "bg-emerald-100 text-emerald-700";
    case "verified":
      return "bg-emerald-100 text-emerald-700";
    case "failed":
      return "bg-rose-100 text-rose-700";
    case "rejected":
      return "bg-slate-200 text-slate-700";
    case "cancelled":
      return "bg-slate-200 text-slate-700";
    default:
      return "bg-slate-100 text-slate-600";
  }
}

export function RemediationsBoard({
  items,
  plants,
  activeStatus,
  plantFilter,
  countByStatus,
  canApprove,
}: {
  items: RemediationItem[];
  plants: PlantOption[];
  activeStatus: string;
  plantFilter: string | null;
  countByStatus: Record<string, number>;
  canApprove: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setQuery = (next: { status?: string; plantId?: string | null }) => {
    const sp = new URLSearchParams(params.toString());
    if (next.status) sp.set("status", next.status);
    if (next.plantId === null) sp.delete("plantId");
    else if (typeof next.plantId === "string") sp.set("plantId", next.plantId);
    startTransition(() => router.push(`/remediaciones?${sp.toString()}`));
  };

  const act = async (
    id: string,
    action: "approve" | "reject" | "execute" | "verify" | "cancel" | "retry",
    extra: Record<string, unknown> = {},
  ) => {
    setBusyId(id);
    setError(null);
    try {
      const res = await fetch(`/api/remediations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {STATUS_TABS.map((tab) => {
          const active = tab.value === activeStatus;
          const count = countByStatus[tab.value] ?? 0;
          return (
            <button
              key={tab.value}
              type="button"
              onClick={() => setQuery({ status: tab.value })}
              className={
                "rounded-full px-3 py-1 text-xs font-medium transition " +
                (active
                  ? "bg-slate-900 text-white"
                  : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")
              }
            >
              {tab.label}{" "}
              <span className={active ? "text-white/70" : "text-slate-400"}>· {count}</span>
            </button>
          );
        })}
        <div className="ml-auto flex items-center gap-2">
          <select
            value={plantFilter ?? ""}
            onChange={(e) => setQuery({ plantId: e.target.value || null })}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs"
          >
            <option value="">Todas las plantas</option>
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.code}
              </option>
            ))}
          </select>
          {pending ? <Loader2 className="h-4 w-4 animate-spin text-slate-400" /> : null}
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-700">
          {error}
        </div>
      ) : null}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Planta</th>
              <th className="px-4 py-3">Comando</th>
              <th className="px-4 py-3">Origen</th>
              <th className="px-4 py-3">Modo</th>
              <th className="px-4 py-3">Confianza</th>
              <th className="px-4 py-3">Cuándo</th>
              <th className="px-4 py-3 text-right">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                  Sin remediaciones en este estado.
                </td>
              </tr>
            ) : (
              items.map((r) => {
                const isBusy = busyId === r.id;
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3">
                      <div className="font-medium text-slate-900">{r.plantName}</div>
                      <div className="text-[11px] text-slate-500">
                        {r.plantCode} · {r.providerSlug ?? "—"}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="font-mono text-xs text-slate-800">{r.commandType}</div>
                      <div className="line-clamp-2 max-w-md text-[11px] text-slate-500">
                        {r.reason}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {r.alarm ? (
                        <Link
                          href={`/alarmas?focus=${r.alarm.id}`}
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-slate-200 hover:bg-slate-100"
                        >
                          <span
                            className={"rounded px-1 " + severityBadge(r.alarm.severity)}
                          >
                            {r.alarm.severity}
                          </span>
                          {r.alarm.type}
                        </Link>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                      <div className="mt-0.5 text-[11px] text-slate-500">
                        propuso: {r.proposedBy}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded px-1.5 py-0.5 text-[11px] font-medium " +
                          (r.executionMode === "real"
                            ? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
                            : "bg-slate-100 text-slate-600")
                        }
                      >
                        {r.executionMode}
                      </span>
                      <div className="mt-0.5">
                        <span className={"rounded px-1.5 py-0.5 text-[11px] " + statusBadge(r.status)}>
                          {r.status}
                        </span>
                      </div>
                      {r.verifiedOutcome ? (
                        <div className="mt-0.5 text-[11px] text-emerald-700">
                          ✓ {r.verifiedOutcome}
                        </div>
                      ) : null}
                      {r.retryCount > 0 ? (
                        <div className="mt-0.5 text-[11px] text-amber-700">
                          retry {r.retryCount}
                          {r.nextRetryAt ? ` · próx. ${new Date(r.nextRetryAt).toLocaleTimeString("es-CO")}` : ""}
                        </div>
                      ) : null}
                    </td>
                    <td className="px-4 py-3">
                      {r.aiConfidence !== null ? (
                        <span className="font-mono text-xs text-slate-700">
                          {(r.aiConfidence * 100).toFixed(0)}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {new Date(r.proposedAt).toLocaleString("es-CO")}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-1">
                        {r.status === "proposed" && canApprove ? (
                          <>
                            <button
                              onClick={() => act(r.id, "approve")}
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-sky-700 disabled:opacity-50"
                              title="Aprobar"
                            >
                              <ShieldCheck className="h-3 w-3" /> Aprobar
                            </button>
                            <button
                              onClick={() =>
                                act(r.id, "reject", {
                                  reason: prompt("Motivo del rechazo:", "no aplica") ?? "sin motivo",
                                })
                              }
                              disabled={isBusy}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                              title="Rechazar"
                            >
                              <XCircle className="h-3 w-3" /> Rechazar
                            </button>
                          </>
                        ) : null}
                        {r.status === "approved" && canApprove ? (
                          <button
                            onClick={() => act(r.id, "execute")}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                            title="Ejecutar"
                          >
                            <Play className="h-3 w-3" /> Ejecutar
                          </button>
                        ) : null}
                        {r.status === "executed" && !r.verifiedOutcome ? (
                          <button
                            onClick={() => act(r.id, "verify")}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                            title="Verificar"
                          >
                            <CheckCircle2 className="h-3 w-3" /> Verificar
                          </button>
                        ) : null}
                        {r.status === "failed" && canApprove ? (
                          <button
                            onClick={() => act(r.id, "retry")}
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-800 hover:bg-amber-100 disabled:opacity-50"
                            title="Reintentar"
                          >
                            <RefreshCcw className="h-3 w-3" /> Reintentar
                          </button>
                        ) : null}
                        {(r.status === "proposed" || r.status === "approved") && canApprove ? (
                          <button
                            onClick={() =>
                              act(r.id, "cancel", {
                                reason: prompt("Motivo de cancelación:", "ya no aplica") ?? "cancelado",
                              })
                            }
                            disabled={isBusy}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-[11px] text-slate-600 hover:bg-slate-50 disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                        ) : null}
                        <Link
                          href={`/remediaciones/${r.id}`}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] text-slate-700 hover:bg-slate-50"
                        >
                          Ver <ChevronRight className="h-3 w-3" />
                        </Link>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
