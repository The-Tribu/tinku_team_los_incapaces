"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Ticket, X } from "lucide-react";
import type { AlarmItem } from "./alarms-center";

type Props = {
  alarm: AlarmItem;
  assignableUsers: AssignableUser[];
  onClose: () => void;
  onCreated: (ticket: { id: string; title: string }) => void;
  onError: (message: string) => void;
};

export type AssignableUser = {
  id: string;
  name: string;
  email: string;
  role: string;
};

const PRIORITIES: { value: "low" | "medium" | "high" | "urgent"; label: string; tone: string }[] = [
  { value: "low", label: "Baja", tone: "bg-slate-100 text-slate-700" },
  { value: "medium", label: "Media", tone: "bg-sky-100 text-sky-700" },
  { value: "high", label: "Alta", tone: "bg-amber-100 text-amber-800" },
  { value: "urgent", label: "Urgente", tone: "bg-rose-100 text-rose-700" },
];

function deriveSuggestedTitle(alarm: AlarmItem): string {
  const typeLabels: Record<string, string> = {
    offline: "Inversor offline",
    frequency: "Frecuencia fuera de rango",
    voltage: "Voltaje fuera de rango",
    low_gen: "Generación baja",
    temperature: "Temperatura alta",
    provider: "Alarma del proveedor",
  };
  const base = typeLabels[alarm.type] ?? alarm.message;
  return `${base} · ${alarm.plant.name}`;
}

function derivePriority(severity: AlarmItem["severity"]): "low" | "medium" | "high" | "urgent" {
  if (severity === "critical") return "urgent";
  if (severity === "warning") return "high";
  return "medium";
}

export function TicketCreateModal({
  alarm,
  assignableUsers,
  onClose,
  onCreated,
  onError,
}: Props) {
  const [mounted, setMounted] = useState(false);
  const [title, setTitle] = useState(deriveSuggestedTitle(alarm));
  const [description, setDescription] = useState(alarm.aiSuggestion ?? "");
  const [priority, setPriority] = useState(derivePriority(alarm.severity));
  const [assigneeId, setAssigneeId] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function handleSubmit() {
    if (!title.trim() || submitting) return;
    setSubmitting(true);
    try {
      const assignee = assigneeId
        ? assignableUsers.find((u) => u.id === assigneeId)?.name ?? null
        : null;
      const res = await fetch(`/api/alarms/${alarm.id}/tickets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim() || null,
          priority,
          assignee,
        }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "No se pudo crear el ticket");
      }
      const data = (await res.json()) as { ticket: { id: string; title: string } };
      onCreated(data.ticket);
    } catch (err) {
      onError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (!mounted) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-emerald-700">
              <Ticket className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Crear ticket
              </span>
            </div>
            <h3 className="mt-0.5 font-heading text-base font-semibold text-slate-900">
              {alarm.plant.name} · {alarm.device.externalId}
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">{alarm.message}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="space-y-4 px-5 py-4">
          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Título
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="h-9 w-full rounded-md border border-slate-200 bg-white px-2.5 text-sm text-slate-800 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              placeholder="Ej. Visita técnica a inversor"
            />
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Descripción
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              placeholder="Detalles adicionales, pasos siguientes, contexto…"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Prioridad
              </label>
              <div className="flex flex-wrap gap-1">
                {PRIORITIES.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPriority(p.value)}
                    className={`rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                      priority === p.value
                        ? p.tone
                        : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                Asignar a
              </label>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                className="h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-sm text-slate-800 outline-none focus:border-emerald-300 focus:ring-2 focus:ring-emerald-100"
              >
                <option value="">Sin asignar</option>
                {assignableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} · {u.role}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center rounded-md px-3 py-2 text-sm font-medium text-slate-600 hover:bg-white"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting || !title.trim()}
            className="inline-flex items-center gap-1.5 rounded-md bg-sunhub-primary px-3 py-2 text-sm font-semibold text-white transition hover:bg-emerald-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Ticket className="h-3.5 w-3.5" />}
            {submitting ? "Creando…" : "Crear ticket"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
