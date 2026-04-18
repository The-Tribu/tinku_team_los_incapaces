"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Loader2, Play, RefreshCcw, ShieldCheck, XCircle } from "lucide-react";

export function RemediationDetailActions({
  id,
  status,
  verifiedOutcome,
  canApprove,
}: {
  id: string;
  status: string;
  verifiedOutcome: string | null;
  canApprove: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const act = async (action: string, extra: Record<string, unknown> = {}) => {
    setBusy(action);
    setError(null);
    try {
      const res = await fetch(`/api/remediations/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, ...extra }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "error");
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  if (!canApprove && status !== "executed") return null;
  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      {status === "proposed" && canApprove ? (
        <>
          <button
            onClick={() => act("approve")}
            disabled={!!busy}
            className="inline-flex items-center gap-1 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-sky-700 disabled:opacity-50"
          >
            {busy === "approve" ? <Loader2 className="h-3 w-3 animate-spin" /> : <ShieldCheck className="h-3 w-3" />}
            Aprobar
          </button>
          <button
            onClick={() =>
              act("reject", { reason: prompt("Motivo del rechazo:", "no aplica") ?? "sin motivo" })
            }
            disabled={!!busy}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
          >
            <XCircle className="h-3 w-3" /> Rechazar
          </button>
        </>
      ) : null}
      {status === "approved" && canApprove ? (
        <button
          onClick={() => act("execute")}
          disabled={!!busy}
          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {busy === "execute" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
          Ejecutar
        </button>
      ) : null}
      {status === "executed" && !verifiedOutcome ? (
        <button
          onClick={() => act("verify")}
          disabled={!!busy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          <CheckCircle2 className="h-3 w-3" /> Verificar
        </button>
      ) : null}
      {status === "failed" && canApprove ? (
        <button
          onClick={() => act("retry")}
          disabled={!!busy}
          className="inline-flex items-center gap-1 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
        >
          <RefreshCcw className="h-3 w-3" /> Reintentar
        </button>
      ) : null}
      {(status === "proposed" || status === "approved") && canApprove ? (
        <button
          onClick={() =>
            act("cancel", {
              reason: prompt("Motivo de cancelación:", "ya no aplica") ?? "cancelado",
            })
          }
          disabled={!!busy}
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs text-slate-600 hover:bg-slate-50"
        >
          Cancelar
        </button>
      ) : null}
      {error ? <span className="text-xs text-rose-600">{error}</span> : null}
    </div>
  );
}
