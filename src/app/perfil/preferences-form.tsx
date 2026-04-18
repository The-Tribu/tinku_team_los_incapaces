"use client";

import { useState } from "react";
import { Bell, Mail, Volume2 } from "lucide-react";

type Prefs = {
  emailEnabled: boolean;
  browserEnabled: boolean;
  soundEnabled: boolean;
  minSeverity: "critical" | "warning" | "info";
  cooldownMinutes: number;
};

export function PreferencesForm({ initial }: { initial: Prefs }) {
  const [prefs, setPrefs] = useState<Prefs>(initial);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  async function save(next: Partial<Prefs>) {
    setStatus("saving");
    const body = { ...prefs, ...next };
    setPrefs(body);
    try {
      const res = await fetch("/api/notification-preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(String(res.status));
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 1500);
    } catch {
      setStatus("error");
    }
  }

  async function requestBrowserPermission() {
    if (typeof window === "undefined" || !("Notification" in window)) return;
    const res = await Notification.requestPermission();
    if (res === "granted") await save({ browserEnabled: true });
  }

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Notificaciones</h2>
          <p className="text-xs text-slate-500">Configura cómo se te avisa cuando detectamos una alarma.</p>
        </div>
        <span
          className={`text-xs ${
            status === "saved" ? "text-emerald-600" : status === "error" ? "text-red-600" : "text-slate-400"
          }`}
        >
          {status === "saving" ? "Guardando…" : status === "saved" ? "✓ Guardado" : status === "error" ? "Error" : ""}
        </span>
      </div>

      <div className="mt-5 space-y-4">
        <Toggle
          icon={<Mail className="h-4 w-4" />}
          label="Correo electrónico"
          description="Enviamos un email por cada alarma que supere la severidad mínima."
          checked={prefs.emailEnabled}
          onChange={(v) => save({ emailEnabled: v })}
        />
        <Toggle
          icon={<Bell className="h-4 w-4" />}
          label="Notificaciones del navegador"
          description="Popup del SO mientras SunHub esté abierto."
          checked={prefs.browserEnabled}
          onChange={(v) => save({ browserEnabled: v })}
          extra={
            <button
              type="button"
              onClick={requestBrowserPermission}
              className="text-[11px] font-medium text-emerald-700 hover:underline"
            >
              Permitir notificaciones
            </button>
          }
        />
        <Toggle
          icon={<Volume2 className="h-4 w-4" />}
          label="Sonido"
          description="Beep cuando llegue una alarma en la pestaña abierta."
          checked={prefs.soundEnabled}
          onChange={(v) => save({ soundEnabled: v })}
        />
      </div>

      <div className="mt-6 grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
        <label className="text-sm">
          <div className="mb-1 font-medium text-slate-700">Severidad mínima</div>
          <select
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            value={prefs.minSeverity}
            onChange={(e) => save({ minSeverity: e.target.value as Prefs["minSeverity"] })}
          >
            <option value="critical">Solo críticas</option>
            <option value="warning">Warning y superior</option>
            <option value="info">Todas (info+)</option>
          </select>
        </label>
        <label className="text-sm">
          <div className="mb-1 font-medium text-slate-700">Cooldown (min)</div>
          <input
            type="number"
            min={0}
            max={1440}
            className="w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm"
            value={prefs.cooldownMinutes}
            onChange={(e) => save({ cooldownMinutes: Number(e.target.value) })}
          />
          <p className="mt-1 text-[11px] text-slate-400">
            Evita repetir el mismo email del mismo device+tipo en menos de X minutos.
          </p>
        </label>
      </div>
    </section>
  );
}

function Toggle({
  icon,
  label,
  description,
  checked,
  onChange,
  extra,
}: {
  icon: React.ReactNode;
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  extra?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-slate-600">
        {icon}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-slate-800">{label}</span>
          {extra}
        </div>
        <p className="text-xs text-slate-500">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition ${
          checked ? "bg-emerald-500" : "bg-slate-300"
        }`}
      >
        <span
          className={`inline-block h-5 w-5 rounded-full bg-white shadow transition ${
            checked ? "translate-x-5" : "translate-x-0.5"
          }`}
        />
      </button>
    </div>
  );
}
