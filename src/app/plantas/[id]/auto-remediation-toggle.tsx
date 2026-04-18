"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";

export function AutoRemediationToggle({
  plantId,
  initialEnabled,
}: {
  plantId: string;
  initialEnabled: boolean;
}) {
  const router = useRouter();
  const [enabled, setEnabled] = useState(initialEnabled);
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const res = await fetch(`/api/remediation/plants/${plantId}/toggle`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ enabled: !enabled }),
    });
    if (res.ok) {
      const data = (await res.json()) as { plant?: { autoRemediationEnabled: boolean } };
      if (data.plant) setEnabled(data.plant.autoRemediationEnabled);
      router.refresh();
    }
    setBusy(false);
  }

  return (
    <div className="mt-3 flex items-start justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3">
      <div>
        <div className="text-sm font-semibold text-slate-900">Auto-remediación</div>
        <p className="mt-0.5 text-xs text-slate-600">
          Si se activa, el agente puede ejecutar acciones correctivas no críticas en esta planta según las políticas configuradas.
        </p>
      </div>
      <button
        disabled={busy}
        onClick={toggle}
        className={`h-6 w-11 shrink-0 rounded-full transition ${
          enabled ? "bg-emerald-500" : "bg-slate-300"
        } disabled:opacity-50`}
      >
        <span
          className={`block h-5 w-5 rounded-full bg-white shadow transition ${enabled ? "translate-x-5" : "translate-x-0.5"}`}
        />
      </button>
    </div>
  );
}
