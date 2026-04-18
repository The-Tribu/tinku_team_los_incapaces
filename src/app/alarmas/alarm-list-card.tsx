"use client";

import { AlertOctagon, AlertTriangle, Info, Sparkles, Ticket } from "lucide-react";
import { BrandChip } from "@/components/sunhub/brand-chip";
import { cn } from "@/lib/cn";
import type { AlarmItem, AlarmSeverity } from "./alarms-center";

type Props = {
  item: AlarmItem;
  selected: boolean;
  onSelect: () => void;
  onAccept: () => void;
  onCreateTicket: () => void;
};

const SEVERITY_META: Record<
  AlarmSeverity,
  { rail: string; chipBg: string; chipText: string; label: string; Icon: typeof AlertOctagon }
> = {
  critical: {
    rail: "border-l-red-500",
    chipBg: "bg-red-50",
    chipText: "text-red-700",
    label: "Crítica",
    Icon: AlertOctagon,
  },
  warning: {
    rail: "border-l-amber-500",
    chipBg: "bg-amber-50",
    chipText: "text-amber-700",
    label: "Advertencia",
    Icon: AlertTriangle,
  },
  info: {
    rail: "border-l-sky-500",
    chipBg: "bg-sky-50",
    chipText: "text-sky-700",
    label: "Info",
    Icon: Info,
  },
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

function deriveTitle(item: AlarmItem) {
  // Ej: "Inversor offline · Carvajal Cali"
  const TYPE_LABELS: Record<string, string> = {
    offline: "Inversor offline",
    frequency: "Frecuencia fuera de rango",
    voltage: "Voltaje fuera de rango",
    low_gen: "Generación baja",
    temperature: "Temperatura alta",
    provider: "Alarma del proveedor",
    degradation: "Degradación progresiva",
  };
  const base = TYPE_LABELS[item.type] ?? item.message;
  return `${base} · ${item.plant.name}`;
}

export function AlarmListCard({ item, selected, onSelect, onAccept, onCreateTicket }: Props) {
  const meta = SEVERITY_META[item.severity] ?? SEVERITY_META.info;
  const { Icon } = meta;
  const resolved = !!item.resolvedAt;

  return (
    <li>
      <div
        role="button"
        tabIndex={0}
        onClick={onSelect}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onSelect();
          }
        }}
        className={cn(
          "group cursor-pointer rounded-xl border border-slate-200 bg-white p-3 transition",
          "border-l-4",
          meta.rail,
          selected
            ? "ring-2 ring-emerald-200 shadow-sm"
            : "hover:border-slate-300 hover:shadow-sm",
        )}
      >
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "mt-0.5 inline-flex h-7 w-7 items-center justify-center rounded-full",
              meta.chipBg,
              meta.chipText,
            )}
          >
            <Icon className="h-3.5 w-3.5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex items-start justify-between gap-2">
              <h3 className="truncate text-sm font-semibold text-slate-900">
                {deriveTitle(item)}
              </h3>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  meta.chipBg,
                  meta.chipText,
                )}
              >
                {meta.label}
              </span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
              <span className="font-mono text-[11px] text-slate-600">
                {item.device.externalId}
              </span>
              <span className="text-slate-300">·</span>
              <span>{item.plant.code}</span>
              <BrandChip slug={item.provider.slug} size="sm" />
              <span className="text-slate-300">·</span>
              <span>{fmtAgo(item.startedAt)}</span>
              {item.assignee ? (
                <>
                  <span className="text-slate-300">·</span>
                  <span className="text-slate-600">Asignada a {item.assignee}</span>
                </>
              ) : null}
            </div>

            {item.aiSuggestion ? (
              <div className="mt-2 inline-flex max-w-full items-start gap-1.5 rounded-lg bg-emerald-50/70 px-2 py-1 text-[11px] text-emerald-800 ring-1 ring-emerald-100">
                <Sparkles className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600" />
                <span className="line-clamp-2">{item.aiSuggestion}</span>
              </div>
            ) : null}

            {!resolved ? (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onAccept();
                  }}
                  className="inline-flex items-center gap-1 rounded-md bg-sunhub-primary px-2.5 py-1 text-[11px] font-semibold text-white transition hover:bg-emerald-700"
                >
                  Aceptar
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCreateTicket();
                  }}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-700 transition hover:bg-slate-50"
                >
                  <Ticket className="h-3 w-3" />
                  Crear ticket
                </button>
              </div>
            ) : (
              <div className="mt-2 text-[11px] font-medium text-emerald-700">
                Resuelta {item.resolvedAt ? fmtAgo(item.resolvedAt) : ""}
              </div>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}
