"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Bell, BellRing } from "lucide-react";
import { cn } from "@/lib/cn";

type AlarmEvent = {
  id: string;
  severity: "critical" | "warning" | "info";
  type: string;
  message: string;
  plantName: string;
  plantCode: string;
  provider: string;
  startedAt: string;
  kind: "new" | "resolved" | "ack";
};

type AlarmRow = {
  id: string;
  severity: "critical" | "warning" | "info";
  message: string;
  startedAt: string;
  plant: { name: string; code: string };
};

type Preferences = {
  soundEnabled: boolean;
  browserEnabled: boolean;
  minSeverity: "critical" | "warning" | "info";
};

function sevRank(s: string) {
  return s === "critical" ? 3 : s === "warning" ? 2 : 1;
}

// Beep generado con WebAudio — evita tener que servir un mp3.
function playBeep(severity: string) {
  try {
    const AC = (window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
    if (!AC) return;
    const ctx = new AC();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(severity === "critical" ? 880 : 660, now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(0.15, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);
    osc.connect(gain).connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.65);
    if (severity === "critical") {
      // Double-beep
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = "square";
      osc2.frequency.setValueAtTime(880, now + 0.25);
      gain2.gain.setValueAtTime(0, now + 0.25);
      gain2.gain.linearRampToValueAtTime(0.15, now + 0.27);
      gain2.gain.exponentialRampToValueAtTime(0.0001, now + 0.9);
      osc2.connect(gain2).connect(ctx.destination);
      osc2.start(now + 0.25);
      osc2.stop(now + 0.95);
    }
    setTimeout(() => ctx.close(), 1200);
  } catch {
    // ignora errores de audio (autoplay policy, etc.)
  }
}

export function AlarmBell() {
  const [open, setOpen] = useState(false);
  const [alarms, setAlarms] = useState<AlarmRow[]>([]);
  const [openCount, setOpenCount] = useState(0);
  const [criticalCount, setCriticalCount] = useState(0);
  const [flash, setFlash] = useState(false);
  const [connected, setConnected] = useState(false);
  const [prefs, setPrefs] = useState<Preferences>({ soundEnabled: true, browserEnabled: true, minSeverity: "warning" });
  const [notificationsGranted, setNotificationsGranted] = useState(false);

  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  // Carga inicial: alarmas recientes + preferencias.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [a, p] = await Promise.all([
          fetch("/api/alarms?status=open&limit=8").then((r) => r.json()),
          fetch("/api/notification-preferences").then((r) => r.json()).catch(() => null),
        ]);
        if (cancelled) return;
        setAlarms(a.alarms ?? []);
        setOpenCount(a.counts?.open ?? 0);
        setCriticalCount(a.counts?.critical ?? 0);
        if (p?.preferences) setPrefs({
          soundEnabled: p.preferences.soundEnabled,
          browserEnabled: p.preferences.browserEnabled,
          minSeverity: p.preferences.minSeverity,
        });
      } catch {
        /* no-op */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    setNotificationsGranted(Notification.permission === "granted");
  }, []);

  // SSE
  useEffect(() => {
    if (typeof window === "undefined") return;
    const es = new EventSource("/api/alarms/stream");
    esRef.current = es;

    es.addEventListener("hello", () => setConnected(true));
    es.addEventListener("alarm", (ev: MessageEvent) => {
      let event: AlarmEvent;
      try { event = JSON.parse(ev.data); } catch { return; }
      handleEvent(event);
    });
    es.onerror = () => setConnected(false);
    es.onopen = () => setConnected(true);

    return () => {
      es.close();
      esRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prefs.soundEnabled, prefs.browserEnabled, prefs.minSeverity]);

  function handleEvent(event: AlarmEvent) {
    if (event.kind === "new") {
      // Deduplicar: el SSE puede re-emitir la misma alarma por DB-poll + bus
      // in-process (dos fuentes), y el fetch inicial ya trae las abiertas.
      // Si ya la tenemos, la saltamos (sin incrementar contadores ni sonar).
      let alreadySeen = false;
      setAlarms((prev) => {
        if (prev.some((x) => x.id === event.id)) {
          alreadySeen = true;
          return prev;
        }
        return [{
          id: event.id,
          severity: event.severity,
          message: event.message,
          startedAt: event.startedAt,
          plant: { name: event.plantName, code: event.plantCode },
        }, ...prev].slice(0, 8);
      });
      if (alreadySeen) return;

      setOpenCount((c) => c + 1);
      if (event.severity === "critical") setCriticalCount((c) => c + 1);

      const passesSeverity = sevRank(event.severity) >= sevRank(prefs.minSeverity);
      if (passesSeverity) {
        triggerFlash();
        if (prefs.soundEnabled) playBeep(event.severity);
        if (prefs.browserEnabled && notificationsGranted) {
          try {
            new Notification(`SunHub · ${event.severity.toUpperCase()}`, {
              body: `${event.plantName}: ${event.message}`,
              tag: event.id,
              requireInteraction: event.severity === "critical",
            });
          } catch { /* permisos revocados en runtime */ }
        }
      }
    } else if (event.kind === "resolved") {
      let wasPresent = false;
      setAlarms((prev) => {
        const next = prev.filter((a) => a.id !== event.id);
        wasPresent = next.length !== prev.length;
        return next;
      });
      if (wasPresent) {
        setOpenCount((c) => Math.max(0, c - 1));
        if (event.severity === "critical") setCriticalCount((c) => Math.max(0, c - 1));
      }
    }
  }

  function triggerFlash() {
    setFlash(true);
    if (flashTimer.current) clearTimeout(flashTimer.current);
    flashTimer.current = setTimeout(() => setFlash(false), 4000);
  }

  async function requestPermission() {
    if (!("Notification" in window)) return;
    const res = await Notification.requestPermission();
    setNotificationsGranted(res === "granted");
  }

  const Icon = useMemo(() => (openCount > 0 ? BellRing : Bell), [openCount]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={`${openCount} alarmas abiertas`}
        className={cn(
          "relative inline-flex h-9 w-9 items-center justify-center rounded-full border text-slate-600",
          flash
            ? "animate-pulse border-red-300 bg-red-50 text-red-700 shadow-[0_0_0_3px_rgba(248,113,113,0.25)]"
            : openCount > 0
              ? "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100"
              : "border-slate-200 bg-white hover:bg-slate-50",
        )}
      >
        <Icon className="h-4 w-4" />
        {openCount > 0 && (
          <span
            className={cn(
              "absolute -right-1 -top-1 inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[10px] font-semibold text-white",
              criticalCount > 0 ? "bg-red-600" : "bg-amber-500",
            )}
          >
            {openCount > 99 ? "99+" : openCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 z-[1100] mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <div>
              <div className="text-sm font-semibold text-slate-900">Alarmas</div>
              <div className="text-[11px] text-slate-500">
                {openCount} abiertas · {criticalCount} críticas ·{" "}
                <span className={connected ? "text-emerald-600" : "text-slate-400"}>
                  {connected ? "● vivo" : "○ sin stream"}
                </span>
              </div>
            </div>
            <Link
              href="/alarmas"
              className="rounded-md bg-slate-900 px-2.5 py-1.5 text-[11px] font-medium text-white hover:bg-slate-800"
              onClick={() => setOpen(false)}
            >
              Ver centro
            </Link>
          </div>

          {!notificationsGranted && (
            <button
              type="button"
              onClick={requestPermission}
              className="block w-full bg-amber-50 px-4 py-2 text-left text-xs text-amber-800 hover:bg-amber-100"
            >
              🔔 Activar notificaciones del navegador
            </button>
          )}

          <ul className="max-h-80 divide-y divide-slate-100 overflow-auto">
            {alarms.length === 0 ? (
              <li className="px-4 py-8 text-center text-xs text-slate-400">
                Sin alarmas abiertas
              </li>
            ) : (
              alarms.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/alarmas?selectedId=${a.id}`}
                    onClick={() => setOpen(false)}
                    className="flex items-start gap-2 px-4 py-3 transition hover:bg-slate-50"
                  >
                    <span
                      className={cn(
                        "mt-1 h-2 w-2 shrink-0 rounded-full",
                        a.severity === "critical"
                          ? "bg-red-600"
                          : a.severity === "warning"
                            ? "bg-amber-500"
                            : "bg-blue-500",
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-900">
                        {a.message}
                      </div>
                      <div className="truncate text-[11px] text-slate-500">
                        {a.plant.name} · {a.plant.code} ·{" "}
                        {new Date(a.startedAt).toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit" })}
                      </div>
                    </div>
                  </Link>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
