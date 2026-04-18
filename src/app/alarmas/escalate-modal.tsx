"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, Send, X } from "lucide-react";
import type { AlarmItem } from "./alarms-center";

type Props = {
  alarm: AlarmItem;
  clientEmail: string | null;
  onClose: () => void;
  onEscalated: (result: { status: string; to?: string; reason?: string }) => void;
  onError: (message: string) => void;
};

export function EscalateModal({ alarm, clientEmail, onClose, onEscalated, onError }: Props) {
  const [mounted, setMounted] = useState(false);
  const [note, setNote] = useState("");
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
    if (submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/alarms/${alarm.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ escalate: { note: note.trim() || undefined } }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? "No se pudo escalar");
      }
      const data = (await res.json()) as {
        escalation: { status: string; to?: string; reason?: string } | null;
      };
      onEscalated(data.escalation ?? { status: "sent" });
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
        className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div>
            <div className="flex items-center gap-2 text-amber-700">
              <Send className="h-4 w-4" />
              <span className="text-[11px] font-semibold uppercase tracking-wider">
                Escalar al cliente
              </span>
            </div>
            <h3 className="mt-0.5 font-heading text-base font-semibold text-slate-900">
              {alarm.plant.name}
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

        <div className="space-y-3 px-5 py-4">
          <div className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-100">
            {clientEmail ? (
              <>
                Se enviará un correo a <span className="font-mono font-semibold">{clientEmail}</span>{" "}
                notificando el escalamiento. La alarma quedará marcada como reconocida.
              </>
            ) : (
              <>
                El cliente no tiene correo de contacto configurado. Se registrará el escalamiento
                pero <span className="font-semibold">no se enviará email</span>. Actualiza el perfil
                del cliente para habilitar el envío.
              </>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-slate-500">
              Nota para el cliente (opcional)
            </label>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={4}
              placeholder="Ej. Hemos detectado degradación en el inversor. Coordinar visita técnica esta semana."
              className="w-full rounded-md border border-slate-200 bg-white px-2.5 py-2 text-sm text-slate-800 outline-none focus:border-amber-300 focus:ring-2 focus:ring-amber-100"
            />
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
            disabled={submitting}
            className="inline-flex items-center gap-1.5 rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
            {submitting ? "Escalando…" : "Escalar ahora"}
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  );
}
