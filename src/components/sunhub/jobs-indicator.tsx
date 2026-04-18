"use client";

/**
 * Indicator persistente en el header que vigila jobs de predicciones
 * masivas. Mientras haya uno corriendo muestra spinner + barra de progreso;
 * cuando termina pop-ea un toast con el resumen — incluso si el usuario
 * navegó a otra página mientras tanto (cada página monta este componente
 * porque está en el AppShell).
 *
 * Hace polling corto (3s) solo cuando hay jobs activos; cuando no hay,
 * cae a un heartbeat lento (30s) para detectar jobs iniciados en otra
 * pestaña/sesión.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { CheckCircle2, Loader2, Sparkles, X, XCircle } from "lucide-react";
import { cn } from "@/lib/cn";

type Job = {
  id: string;
  kind: string;
  status: "pending" | "running" | "completed" | "failed";
  totalCount: number;
  processedCount: number;
  successCount: number;
  failedCount: number;
  totalPredictions: number;
  currentPlant: string | null;
  startedAt: string;
  finishedAt: string | null;
  error: string | null;
};

type Toast = {
  id: string;
  kind: "success" | "error";
  title: string;
  body: string;
};

const ACTIVE_POLL_MS = 3000;
const IDLE_POLL_MS = 30_000;
const SEEN_KEY = "sunhub.jobs.indicator.seen";

function loadSeen(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = window.localStorage.getItem(SEEN_KEY);
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as string[]);
  } catch {
    return new Set();
  }
}

function saveSeen(set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    const arr = Array.from(set).slice(-50);
    window.localStorage.setItem(SEEN_KEY, JSON.stringify(arr));
  } catch {
    /* quota */
  }
}

export function JobsIndicator() {
  const [active, setActive] = useState<Job[]>([]);
  const [open, setOpen] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seenRef = useRef<Set<string>>(new Set());
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    seenRef.current = loadSeen();
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function tick() {
      try {
        const res = await fetch("/api/predictions/jobs?limit=8", { cache: "no-store" });
        if (!res.ok) throw new Error();
        const j = (await res.json()) as { jobs: Job[] };
        if (cancelled) return;
        const running = j.jobs.filter((x) => x.status === "pending" || x.status === "running");
        setActive(running);

        // Detecta jobs completados que aún no hayamos notificado.
        const finished = j.jobs.filter(
          (x) => (x.status === "completed" || x.status === "failed") && !seenRef.current.has(x.id),
        );
        if (finished.length > 0) {
          const nextToasts: Toast[] = finished.map((job) => ({
            id: job.id,
            kind: job.status === "completed" ? "success" : "error",
            title: job.status === "completed" ? "Predicciones listas" : "Corrida con errores",
            body:
              job.status === "completed"
                ? `${job.successCount} de ${job.totalCount} plantas · ${job.totalPredictions} predicciones`
                : job.error ?? "Todas las plantas fallaron",
          }));
          setToasts((prev) => [...nextToasts, ...prev].slice(0, 3));

          // Browser notification (si el usuario ya concedió permiso vía AlarmBell).
          if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
            for (const t of nextToasts) {
              try {
                new Notification(`SunHub · ${t.title}`, { body: t.body, tag: `job-${t.id}` });
              } catch {
                /* no-op */
              }
            }
          }

          for (const f of finished) seenRef.current.add(f.id);
          saveSeen(seenRef.current);
        }

        // También marca como vistos los jobs "viejos" ya terminados en el
        // primer load — evita pop-up de bienvenida con jobs del pasado.
        for (const j2 of j.jobs) {
          if ((j2.status === "completed" || j2.status === "failed") && !seenRef.current.has(j2.id)) {
            // Nunca debería caer aquí tras el bloque de arriba, pero lo dejo
            // por seguridad — un startedAt de hace >1h es "viejo".
            const age = Date.now() - new Date(j2.startedAt).getTime();
            if (age > 60 * 60 * 1000) seenRef.current.add(j2.id);
          }
        }

        const delay = running.length > 0 ? ACTIVE_POLL_MS : IDLE_POLL_MS;
        timerRef.current = setTimeout(tick, delay);
      } catch {
        timerRef.current = setTimeout(tick, IDLE_POLL_MS);
      }
    }

    tick();
    return () => {
      cancelled = true;
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Auto-dismiss de toasts a los 8s.
  useEffect(() => {
    if (toasts.length === 0) return;
    const t = setTimeout(() => setToasts((prev) => prev.slice(0, -1)), 8000);
    return () => clearTimeout(t);
  }, [toasts]);

  const running = active.length > 0;
  const primary = active[0];
  const progressPct = useMemo(() => {
    if (!primary || !primary.totalCount) return 0;
    return Math.round((primary.processedCount / primary.totalCount) * 100);
  }, [primary]);

  // Si no hay jobs activos y no hay toasts, no rendereamos nada.
  if (!running && toasts.length === 0) return null;

  return (
    <>
      {running ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            className="inline-flex h-9 items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-800 hover:bg-emerald-100"
            aria-label="Corridas en progreso"
          >
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            <span>
              {primary.processedCount}/{primary.totalCount}
            </span>
            <span className="hidden sm:inline text-emerald-700/80">plantas</span>
          </button>

          {open ? (
            <div className="absolute right-0 z-[1100] mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
              <div className="border-b border-slate-100 px-4 py-3">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Sparkles className="h-4 w-4 text-emerald-600" />
                  Predicciones masivas en curso
                </div>
                <div className="mt-0.5 text-[11px] text-slate-500">
                  {active.length} {active.length === 1 ? "corrida activa" : "corridas activas"}
                </div>
              </div>
              <ul className="divide-y divide-slate-100">
                {active.map((job) => {
                  const pct = job.totalCount
                    ? Math.round((job.processedCount / job.totalCount) * 100)
                    : 0;
                  return (
                    <li key={job.id} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-2 text-xs font-semibold text-slate-800">
                        <span className="inline-flex items-center gap-1.5">
                          <Loader2 className="h-3 w-3 animate-spin text-emerald-600" />
                          Corriendo
                        </span>
                        <span className="tabular-nums text-slate-600">
                          {job.processedCount}/{job.totalCount} · {pct}%
                        </span>
                      </div>
                      <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-emerald-500 transition-all"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <div className="mt-1.5 truncate text-[11px] text-slate-500" title={job.currentPlant ?? undefined}>
                        {job.currentPlant ? `→ ${job.currentPlant}` : "Preparando…"}
                      </div>
                      <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                        <span>{job.totalPredictions} predicciones generadas</span>
                        <Link
                          href="/predicciones"
                          onClick={() => setOpen(false)}
                          className="text-emerald-700 hover:underline"
                        >
                          Ver panel
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}

      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((p) => p.filter((t) => t.id !== id))} />
    </>
  );
}

function ToastStack({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div className="pointer-events-none fixed bottom-6 right-6 z-[120] flex w-[22rem] max-w-[calc(100vw-2rem)] flex-col gap-2">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            "pointer-events-auto flex items-start gap-3 rounded-xl border bg-white p-3 shadow-lg",
            t.kind === "success" ? "border-emerald-200" : "border-rose-200",
          )}
        >
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
              t.kind === "success" ? "bg-emerald-100 text-emerald-700" : "bg-rose-100 text-rose-700",
            )}
          >
            {t.kind === "success" ? (
              <CheckCircle2 className="h-4 w-4" />
            ) : (
              <XCircle className="h-4 w-4" />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold text-slate-900">{t.title}</div>
            <div className="text-xs text-slate-600">{t.body}</div>
            <Link
              href="/predicciones"
              className="mt-1 inline-block text-[11px] font-medium text-emerald-700 hover:underline"
            >
              Ir a predicciones →
            </Link>
          </div>
          <button
            type="button"
            onClick={() => onDismiss(t.id)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
