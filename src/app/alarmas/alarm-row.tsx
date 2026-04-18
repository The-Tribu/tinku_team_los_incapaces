"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  id: string;
  severity: string;
  message: string;
  plantName: string;
  plantCode: string;
  plantId: string;
  provider: string;
  startedAt: string;
  resolvedAt: string | null;
  aiSuggestion: string | null;
  assignee: string | null;
};

function fmtAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

const SEV_STYLE: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  info: "bg-sky-100 text-sky-700 border-sky-200",
};

export function AlarmRow(props: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    await fetch(`/api/alarms/${props.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusy(false);
    router.refresh();
  }

  return (
    <tr className="border-t border-slate-100 align-top">
      <td className="px-4 py-3">
        <span
          className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
            SEV_STYLE[props.severity] ?? SEV_STYLE.info
          }`}
        >
          {props.severity}
        </span>
      </td>
      <td className="px-4 py-3">
        <div className="text-sm font-medium text-slate-900">{props.message}</div>
        <div className="text-xs text-slate-500">
          {props.provider} · {props.assignee ? `asignada a ${props.assignee}` : "sin asignar"}
        </div>
      </td>
      <td className="px-4 py-3">
        <Link
          href={`/plantas/${props.plantId}`}
          className="text-sm font-medium text-slate-900 hover:text-emerald-700"
        >
          {props.plantName}
        </Link>
        <div className="font-mono text-xs text-slate-500">{props.plantCode}</div>
      </td>
      <td className="px-4 py-3 text-xs text-slate-600">{fmtAgo(props.startedAt)}</td>
      <td className="px-4 py-3 text-xs text-slate-600">
        {props.aiSuggestion ?? <span className="italic text-slate-400">—</span>}
      </td>
      <td className="px-4 py-3 text-right">
        {props.resolvedAt ? (
          <button
            disabled={busy}
            onClick={() => patch({ reopen: true })}
            className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Reabrir
          </button>
        ) : (
          <div className="flex justify-end gap-1.5">
            <button
              disabled={busy}
              onClick={() => patch({ assignee: "Operaciones" })}
              className="rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50"
            >
              Asignar
            </button>
            <button
              disabled={busy}
              onClick={() => patch({ resolve: true })}
              className="rounded-md bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              Resolver
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}
