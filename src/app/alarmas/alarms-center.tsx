"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertOctagon,
  AlertTriangle,
  BellOff,
  Info,
  Search,
  Settings2,
  Shield,
  Timer,
} from "lucide-react";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { cn } from "@/lib/cn";
import { AlarmListCard } from "./alarm-list-card";
import { AlarmDetailPanel } from "./alarm-detail-panel";
import { AlarmToastStack, type AlarmToast } from "./alarm-toast";
import { TicketCreateModal, type AssignableUser } from "./ticket-create-modal";
import { EscalateModal } from "./escalate-modal";

export type AlarmSeverity = "critical" | "warning" | "info";

export type AlarmItem = {
  id: string;
  severity: AlarmSeverity;
  type: string;
  source: string;
  message: string;
  startedAt: string;
  resolvedAt: string | null;
  acknowledgedAt: string | null;
  aiSuggestion: string | null;
  assignee: string | null;
  assignedUserId: string | null;
  escalatedAt: string | null;
  escalatedBy: string | null;
  escalationNote: string | null;
  clientContactEmail: string | null;
  ticketCount: number;
  latestTicket: {
    id: string;
    title: string;
    status: string;
    priority: string;
    createdAt: string;
  } | null;
  device: {
    id: string;
    externalId: string;
    kind: string;
    model: string | null;
    currentStatus: string;
  };
  plant: { id: string; name: string; code: string };
  provider: { slug: string; displayName: string };
};

export type AlarmReadingPoint = {
  ts: string;
  powerKw: number | null;
  voltageV: number | null;
  temperatureC: number | null;
};

type Tab = "all" | "new" | "assigned" | "resolved";

type Props = {
  items: AlarmItem[];
  selectedId: string | null;
  readings: AlarmReadingPoint[];
  counts: {
    all: number;
    new: number;
    assigned: number;
    resolved: number;
    critical: number;
    warning: number;
    info: number;
  };
  kpis: {
    mttrMinutes: number;
    slaPct: number;
  };
  filters: {
    tab: Tab;
    severity: string | null;
    provider: string | null;
    type: string | null;
    window: string | null;
  };
  providerSlugs: string[];
  currentUser: { id: string; name: string; role: string } | null;
  assignableUsers: AssignableUser[];
};

const TABS: { value: Tab; label: string; countKey: keyof Props["counts"] }[] = [
  { value: "all", label: "Todas", countKey: "all" },
  { value: "new", label: "Nuevas", countKey: "new" },
  { value: "assigned", label: "Asignadas", countKey: "assigned" },
  { value: "resolved", label: "Resueltas", countKey: "resolved" },
];

const ALARM_TYPES: { value: string; label: string }[] = [
  { value: "offline", label: "Offline" },
  { value: "frequency", label: "Frecuencia" },
  { value: "voltage", label: "Voltaje" },
  { value: "low_gen", label: "Baja generación" },
  { value: "temperature", label: "Temperatura" },
  { value: "provider", label: "Proveedor" },
];

export function AlarmsCenter({
  items,
  selectedId: initialSelectedId,
  readings,
  counts,
  kpis,
  filters,
  providerSlugs,
  currentUser,
  assignableUsers,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId);
  const [query, setQuery] = useState("");
  const [toasts, setToasts] = useState<AlarmToast[]>([]);
  const [ticketAlarm, setTicketAlarm] = useState<AlarmItem | null>(null);
  const [escalateAlarm, setEscalateAlarm] = useState<AlarmItem | null>(null);

  const selected = useMemo(
    () => items.find((i) => i.id === selectedId) ?? null,
    [items, selectedId],
  );

  const filteredItems = useMemo(() => {
    if (!query.trim()) return items;
    const q = query.toLowerCase();
    return items.filter(
      (i) =>
        i.message.toLowerCase().includes(q) ||
        i.plant.name.toLowerCase().includes(q) ||
        i.plant.code.toLowerCase().includes(q) ||
        i.device.externalId.toLowerCase().includes(q) ||
        i.provider.slug.toLowerCase().includes(q),
    );
  }, [items, query]);

  const pushToast = useCallback((t: Omit<AlarmToast, "id">) => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev) => [{ ...t, id }, ...prev].slice(0, 4));
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  function buildHref(patch: Record<string, string | null>): string {
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.delete("selectedId");
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === "") params.delete(k);
      else params.set(k, v);
    }
    const qs = params.toString();
    return qs ? `/alarmas?${qs}` : "/alarmas";
  }

  function handleSelect(id: string) {
    setSelectedId(id);
    const params = new URLSearchParams(searchParams?.toString() ?? "");
    params.set("selectedId", id);
    startTransition(() => {
      router.replace(`/alarmas?${params.toString()}`, { scroll: false });
    });
  }

  async function patchAlarm(id: string, body: Record<string, unknown>): Promise<boolean> {
    const res = await fetch(`/api/alarms/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return false;
    startTransition(() => router.refresh());
    return true;
  }

  async function handleAccept(item: AlarmItem) {
    const ok = await patchAlarm(item.id, { accept: true });
    if (ok) {
      pushToast({
        kind: "success",
        title: "Alarma aceptada",
        body: currentUser
          ? `Asignada a ${currentUser.name}`
          : "Marcada como reconocida",
      });
    } else {
      pushToast({ kind: "error", title: "No se pudo aceptar la alarma" });
    }
  }

  async function handleAssign(id: string, userId: string | null) {
    const ok = await patchAlarm(id, { assignedUserId: userId });
    if (ok) {
      const name = userId ? assignableUsers.find((u) => u.id === userId)?.name : null;
      pushToast({
        kind: "success",
        title: userId ? "Responsable asignado" : "Asignación liberada",
        body: name ? `Alarma asignada a ${name}` : undefined,
      });
    } else {
      pushToast({ kind: "error", title: "No se pudo asignar" });
    }
  }

  async function handleResolve(id: string) {
    const ok = await patchAlarm(id, { resolve: true });
    if (ok) pushToast({ kind: "success", title: "Alarma resuelta" });
    else pushToast({ kind: "error", title: "No se pudo resolver" });
  }

  async function handleReopen(id: string) {
    const ok = await patchAlarm(id, { reopen: true });
    if (ok) pushToast({ kind: "info", title: "Alarma reabierta" });
    else pushToast({ kind: "error", title: "No se pudo reabrir" });
  }

  return (
    <div className="space-y-4">
      {/* KPI row + acciones */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <div className="lg:col-span-1">
          <KpiCard
            label="Críticas"
            value={counts.critical}
            tone="danger"
            compact
            icon={<AlertOctagon className="h-3.5 w-3.5" />}
            hint="abiertas"
          />
        </div>
        <div className="lg:col-span-1">
          <KpiCard
            label="Advertencias"
            value={counts.warning}
            tone="warning"
            compact
            icon={<AlertTriangle className="h-3.5 w-3.5" />}
            hint="abiertas"
          />
        </div>
        <div className="lg:col-span-1">
          <KpiCard
            label="Info"
            value={counts.info}
            tone="info"
            compact
            icon={<Info className="h-3.5 w-3.5" />}
            hint="abiertas"
          />
        </div>
        <div className="lg:col-span-1">
          <KpiCard
            label="MTTR"
            value={kpis.mttrMinutes}
            unit="min"
            tone="neutral"
            compact
            icon={<Timer className="h-3.5 w-3.5" />}
            hint="últimos 30 días"
          />
        </div>
        <div className="lg:col-span-1">
          <KpiCard
            label="SLA"
            value={`${kpis.slaPct.toFixed(1)}%`}
            tone="primary"
            compact
            icon={<Shield className="h-3.5 w-3.5" />}
            hint="resueltas < 60 min"
          />
        </div>
        <div className="flex flex-col justify-between gap-2 lg:col-span-1">
          <button
            type="button"
            onClick={async () => {
              const toAck = items.filter((i) => !i.resolvedAt && !i.acknowledgedAt);
              await Promise.all(toAck.map((i) => patchAlarm(i.id, { ack: true })));
              pushToast({
                kind: "success",
                title: `Silenciadas ${toAck.length} alarmas`,
              });
            }}
            className="inline-flex h-full items-center justify-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2 text-xs font-medium text-slate-700 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-slate-50"
          >
            <BellOff className="h-3.5 w-3.5" />
            Silenciar todas
          </button>
          <Link
            href="/configuracion?tab=alarmas"
            className="inline-flex h-full items-center justify-center gap-2 rounded-2xl bg-sunhub-primary px-3 py-2 text-xs font-semibold text-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:bg-emerald-700"
          >
            <Settings2 className="h-3.5 w-3.5" />
            Configurar reglas
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <nav className="flex flex-wrap items-center gap-1 border-b border-slate-200">
        {TABS.map((t) => {
          const active = filters.tab === t.value;
          const count = counts[t.countKey];
          const href = buildHref({ status: t.value === "all" ? null : t.value });
          return (
            <Link
              key={t.value}
              href={href}
              className={cn(
                "inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm font-medium transition",
                active
                  ? "border-sunhub-primary text-sunhub-primary"
                  : "border-transparent text-slate-500 hover:text-slate-800",
              )}
            >
              {t.label}
              <span
                className={cn(
                  "inline-flex items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-600",
                )}
              >
                {count}
              </span>
            </Link>
          );
        })}
      </nav>

      {/* Filter chips */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar planta o dispositivo…"
            className="h-8 w-64 rounded-md border border-slate-200 bg-white pl-8 pr-2 text-xs outline-none transition focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
          />
        </div>
        <FilterSelect
          label="Severidad"
          value={filters.severity ?? ""}
          onChange={(v) => router.push(buildHref({ severity: v || null }))}
          options={[
            { value: "critical", label: "Críticas" },
            { value: "warning", label: "Advertencias" },
            { value: "info", label: "Info" },
          ]}
        />
        <FilterSelect
          label="Marca"
          value={filters.provider ?? ""}
          onChange={(v) => router.push(buildHref({ provider: v || null }))}
          options={providerSlugs.map((s) => ({
            value: s,
            label: s[0].toUpperCase() + s.slice(1),
          }))}
        />
        <FilterSelect
          label="Tipo"
          value={filters.type ?? ""}
          onChange={(v) => router.push(buildHref({ type: v || null }))}
          options={ALARM_TYPES}
        />
        <Link
          href={buildHref({ window: filters.window === "24h" ? null : "24h" })}
          className={cn(
            "inline-flex h-8 items-center gap-1 rounded-md px-3 font-medium transition",
            filters.window === "24h"
              ? "bg-slate-900 text-white"
              : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50",
          )}
        >
          Últimas 24h
        </Link>
        {(filters.severity || filters.provider || filters.type || filters.window) ? (
          <Link
            href={buildHref({
              severity: null,
              provider: null,
              type: null,
              window: null,
            })}
            className="inline-flex h-8 items-center rounded-md px-2 text-slate-400 hover:text-slate-700"
          >
            Limpiar
          </Link>
        ) : null}
      </div>

      {/* Master-detail split */}
      <div className={cn("grid gap-4 lg:grid-cols-5", isPending ? "opacity-95" : "")}>
        <div className="lg:col-span-3">
          <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <header className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <h2 className="font-heading text-sm font-semibold text-slate-900">
                Alarmas ({filteredItems.length})
              </h2>
              <span className="text-[11px] text-slate-500">
                Ordenadas por severidad · más recientes primero
              </span>
            </header>
            <ul className="max-h-[70vh] space-y-2 overflow-y-auto p-3">
              {filteredItems.length === 0 ? (
                <li className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  Sin alarmas que coincidan con el filtro.
                </li>
              ) : (
                filteredItems.map((item) => (
                  <AlarmListCard
                    key={item.id}
                    item={item}
                    selected={item.id === selectedId}
                    onSelect={() => handleSelect(item.id)}
                    onAccept={() => handleAccept(item)}
                    onCreateTicket={() => {
                      if (item.latestTicket) {
                        pushToast({
                          kind: "info",
                          title: "Ya existe un ticket",
                          body: item.latestTicket.title,
                        });
                        return;
                      }
                      setTicketAlarm(item);
                    }}
                  />
                ))
              )}
            </ul>
          </div>
        </div>
        <div className="lg:col-span-2">
          <AlarmDetailPanel
            item={selected}
            readings={selected ? readings : []}
            assignableUsers={assignableUsers}
            onResolve={handleResolve}
            onReopen={handleReopen}
            onEscalate={() => selected && setEscalateAlarm(selected)}
            onAssign={handleAssign}
            onCreateTicket={() => {
              if (!selected) return;
              if (selected.latestTicket) {
                pushToast({
                  kind: "info",
                  title: "Ya existe un ticket",
                  body: selected.latestTicket.title,
                });
                return;
              }
              setTicketAlarm(selected);
            }}
          />
        </div>
      </div>

      {ticketAlarm ? (
        <TicketCreateModal
          alarm={ticketAlarm}
          assignableUsers={assignableUsers}
          onClose={() => setTicketAlarm(null)}
          onCreated={(ticket) => {
            setTicketAlarm(null);
            pushToast({
              kind: "success",
              title: "Ticket creado",
              body: ticket.title,
            });
            startTransition(() => router.refresh());
          }}
          onError={(msg) => {
            pushToast({ kind: "error", title: "No se pudo crear el ticket", body: msg });
          }}
        />
      ) : null}

      {escalateAlarm ? (
        <EscalateModal
          alarm={escalateAlarm}
          clientEmail={escalateAlarm.clientContactEmail}
          onClose={() => setEscalateAlarm(null)}
          onEscalated={(result) => {
            setEscalateAlarm(null);
            if (result.status === "sent") {
              pushToast({
                kind: "success",
                title: "Escalada al cliente",
                body: result.to ? `Correo enviado a ${result.to}` : undefined,
              });
            } else if (result.status === "skipped") {
              pushToast({
                kind: "info",
                title: "Escalada registrada",
                body:
                  result.reason === "client_sin_correo"
                    ? "El cliente no tiene correo de contacto"
                    : "Se registró el escalamiento (SMTP no configurado)",
              });
            } else {
              pushToast({
                kind: "error",
                title: "Falló el envío del escalamiento",
                body: result.reason,
              });
            }
            startTransition(() => router.refresh());
          }}
          onError={(msg) => {
            pushToast({ kind: "error", title: "No se pudo escalar", body: msg });
          }}
        />
      ) : null}

      <AlarmToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md bg-white px-2.5 ring-1 ring-slate-200",
        value ? "ring-emerald-300" : "",
      )}
    >
      <span className="text-slate-500">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="bg-transparent text-xs font-medium text-slate-800 outline-none"
      >
        <option value="">Todas</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
