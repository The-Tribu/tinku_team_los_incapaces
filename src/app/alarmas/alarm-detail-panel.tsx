"use client";

import { useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MapPin,
  PlusCircle,
  RefreshCw,
  Send,
  Sparkles,
} from "lucide-react";
import { BrandChip } from "@/components/sunhub/brand-chip";
import { StatusBadge } from "@/components/sunhub/status-badge";
import { cn } from "@/lib/cn";
import type { AlarmItem, AlarmReadingPoint } from "./alarms-center";
import { AlarmChart } from "./alarm-chart";

type Props = {
  item: AlarmItem | null;
  readings: AlarmReadingPoint[];
  onResolve: (id: string) => void;
  onReopen: (id: string) => void;
  onEscalate: (id: string) => void;
  onAssign: (id: string, assignee: string) => void;
};

const ACTIVE_RULES: { id: string; name: string; desc: string }[] = [
  {
    id: "offline",
    name: "Inversor offline > 15 min",
    desc: "Crítica · dispara fanout inmediato",
  },
  {
    id: "lowgen",
    name: "Baja generación vs p05",
    desc: "Advertencia · ventana horaria, ignora clima nublado",
  },
  {
    id: "voltage",
    name: "Voltaje fuera del ±10% de 220V",
    desc: "Advertencia · tolera picos < 2 min",
  },
];

function fmtAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.floor(ms / 60000);
  if (m < 60) return `hace ${m} min`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.floor(h / 24);
  return `hace ${d} d`;
}

export function AlarmDetailPanel({
  item,
  readings,
  onResolve,
  onReopen,
  onEscalate,
  onAssign,
}: Props) {
  const [rulesOpen, setRulesOpen] = useState(true);
  const [comment, setComment] = useState("");
  const [assignee, setAssignee] = useState<string>("");

  if (!item) {
    return (
      <section className="sticky top-4 flex h-full min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <Sparkles className="mb-2 h-6 w-6 text-slate-300" />
        Selecciona una alarma a la izquierda para ver su detalle.
      </section>
    );
  }

  const resolved = !!item.resolvedAt;

  return (
    <section className="sticky top-4 flex flex-col rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 pt-5 pb-4">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
            Detalle de alarma
          </p>
          <h3 className="mt-0.5 truncate font-heading text-base font-semibold text-slate-900">
            {item.device.externalId}
          </h3>
          <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
            <MapPin className="h-3 w-3" />
            {item.plant.name} · Inversor Central #{item.device.externalId.slice(-2)}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <BrandChip slug={item.provider.slug} size="sm" />
          <StatusBadge status={item.device.currentStatus} className="text-[10px]" />
        </div>
      </header>

      <div className="flex-1 space-y-4 px-5 py-4">
        {/* Mini chart */}
        <div>
          <div className="mb-2 flex items-center justify-between">
            <h4 className="text-xs font-semibold text-slate-700">Últimas 48h</h4>
            <Link
              href={`/plantas/${item.plant.id}`}
              className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-700 hover:text-emerald-800"
            >
              Ver planta
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
          <AlarmChart data={readings} />
        </div>

        {/* CTA manual */}
        <Link
          href={`/alarmas?new=1&plantId=${item.plant.id}`}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-sunhub-primary px-3 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700"
        >
          <PlusCircle className="h-4 w-4" />
          Nueva alarma manual
        </Link>

        {/* AI suggestion */}
        {item.aiSuggestion ? (
          <div className="rounded-xl bg-emerald-50/70 p-3 text-xs text-emerald-900 ring-1 ring-emerald-100">
            <div className="mb-1 inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
              <Sparkles className="h-3 w-3" />
              Sugerencia IA
            </div>
            <p className="leading-relaxed">{item.aiSuggestion}</p>
          </div>
        ) : null}

        {/* Metadata */}
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <div>
            <dt className="text-slate-500">Inició</dt>
            <dd className="mt-0.5 font-medium text-slate-800">{fmtAgo(item.startedAt)}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Tipo</dt>
            <dd className="mt-0.5 capitalize text-slate-800">{item.type.replace("_", " ")}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Fuente</dt>
            <dd className="mt-0.5 capitalize text-slate-800">{item.source}</dd>
          </div>
          <div>
            <dt className="text-slate-500">Asignada a</dt>
            <dd className="mt-0.5 text-slate-800">{item.assignee ?? "Sin asignar"}</dd>
          </div>
        </dl>

        {/* Asignar */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Asignar a
          </label>
          <div className="flex items-center gap-2">
            <select
              value={assignee}
              onChange={(e) => setAssignee(e.target.value)}
              className="h-8 flex-1 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-800 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
            >
              <option value="">Seleccionar responsable…</option>
              <option value="Operaciones">Operaciones</option>
              <option value="Mantenimiento">Mantenimiento</option>
              <option value="Cliente">Cliente</option>
              <option value="Juan Pérez">Juan Pérez</option>
            </select>
            <button
              type="button"
              disabled={!assignee}
              onClick={() => assignee && onAssign(item.id, assignee)}
              className="inline-flex h-8 items-center gap-1 rounded-md bg-slate-900 px-3 text-xs font-semibold text-white transition hover:bg-slate-800 disabled:opacity-40"
            >
              Asignar
            </button>
          </div>
        </div>

        {/* Comentario */}
        <div>
          <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
            Comentario
          </label>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={2}
            placeholder="Agregar comentario o bitácora…"
            className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-xs text-slate-800 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </div>

        {/* Botones de cierre / escalamiento */}
        <div className="grid grid-cols-2 gap-2">
          {resolved ? (
            <button
              type="button"
              onClick={() => onReopen(item.id)}
              className="col-span-2 inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Reabrir alarma
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => onResolve(item.id)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md bg-sunhub-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700"
              >
                <CheckCircle2 className="h-4 w-4" />
                Resolver
              </button>
              <button
                type="button"
                onClick={() => onEscalate(item.id)}
                className="inline-flex items-center justify-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
              >
                <Send className="h-3.5 w-3.5" />
                Escalar a cliente
              </button>
            </>
          )}
        </div>

        {/* Reglas activas */}
        <div className="rounded-xl border border-slate-200">
          <button
            type="button"
            onClick={() => setRulesOpen((v) => !v)}
            className="flex w-full items-center justify-between px-3 py-2 text-xs font-semibold text-slate-700"
          >
            <span>Reglas de alarma activas</span>
            {rulesOpen ? (
              <ChevronUp className="h-3.5 w-3.5 text-slate-400" />
            ) : (
              <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
            )}
          </button>
          {rulesOpen ? (
            <ul className="space-y-1 border-t border-slate-100 px-3 py-2">
              {ACTIVE_RULES.map((r) => (
                <li
                  key={r.id}
                  className={cn(
                    "flex items-start justify-between gap-2 rounded-md px-2 py-1.5 text-xs",
                    "hover:bg-slate-50",
                  )}
                >
                  <div>
                    <p className="font-medium text-slate-800">{r.name}</p>
                    <p className="text-[11px] text-slate-500">{r.desc}</p>
                  </div>
                  <span className="mt-0.5 inline-flex h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
