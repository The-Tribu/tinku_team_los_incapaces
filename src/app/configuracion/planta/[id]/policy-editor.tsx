"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

type CommandSummary = {
  id: string;
  label: string;
  description: string;
  risk: "low" | "medium" | "high";
};

type Policy = {
  id: string;
  plantId: string;
  autonomyLevel: "manual" | "approval" | "auto";
  executionMode: "mock" | "real";
  allowedCommands: string[];
  requiredApproverRole: "admin" | "ops";
  maxActionsPerDay: number;
  notes: string | null;
  updatedAt: string;
};

function riskBadge(risk: "low" | "medium" | "high") {
  if (risk === "high") return "bg-rose-100 text-rose-700 ring-rose-200";
  if (risk === "medium") return "bg-amber-100 text-amber-700 ring-amber-200";
  return "bg-emerald-100 text-emerald-700 ring-emerald-200";
}

export function PolicyEditor({
  plantId,
  initial,
  commands,
}: {
  plantId: string;
  initial: Policy;
  commands: CommandSummary[];
}) {
  const router = useRouter();
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggleCommand = (id: string) => {
    setForm((f) => ({
      ...f,
      allowedCommands: f.allowedCommands.includes(id)
        ? f.allowedCommands.filter((x) => x !== id)
        : [...f.allowedCommands, id],
    }));
  };

  const submit = async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch(`/api/policies/${plantId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          autonomyLevel: form.autonomyLevel,
          executionMode: form.executionMode,
          allowedCommands: form.allowedCommands,
          requiredApproverRole: form.requiredApproverRole,
          maxActionsPerDay: form.maxActionsPerDay,
          notes: form.notes ?? null,
        }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error al guardar");
      setForm({ ...form, ...j.policy });
      setSaved(true);
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const realEnabled = form.executionMode === "real";
  const autoEnabled = form.autonomyLevel === "auto";

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-base font-semibold">Nivel de autonomía</h2>
        <p className="text-xs text-slate-500">Qué puede hacer el sistema cuando nace una alarma o anomalía.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          {(
            [
              { v: "manual", title: "Manual", hint: "Solo sugerir. Nada se propone automáticamente." },
              {
                v: "approval",
                title: "Con aprobación",
                hint: "SunHub propone remediaciones; ops/admin aprueba antes de ejecutar.",
              },
              {
                v: "auto",
                title: "Automático",
                hint: "SunHub aprueba y ejecuta sin humano. Respeta modo mock/real.",
              },
            ] as const
          ).map((opt) => (
            <button
              key={opt.v}
              type="button"
              onClick={() => setForm({ ...form, autonomyLevel: opt.v })}
              className={
                "rounded-xl border p-4 text-left transition " +
                (form.autonomyLevel === opt.v
                  ? "border-sky-400 bg-sky-50 ring-2 ring-sky-200"
                  : "border-slate-200 bg-white hover:border-slate-300")
              }
            >
              <div className="font-semibold text-slate-900">{opt.title}</div>
              <div className="text-xs text-slate-500">{opt.hint}</div>
            </button>
          ))}
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-base font-semibold">Modo de ejecución</h2>
            <p className="text-xs text-slate-500">
              <b>Mock:</b> simula el envío del comando y guarda el audit como <i>simulated</i>. Nada sale al
              middleware.
              <br />
              <b>Real:</b> POST al endpoint del proveedor. El middleware del hackathon responde 4xx en writes —
              queda registrado en el audit log.
            </p>
          </div>
          <label className="flex cursor-pointer select-none items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
            <span className="text-xs font-semibold uppercase text-slate-500">Prueba real</span>
            <span className="relative inline-flex h-6 w-11 items-center">
              <input
                type="checkbox"
                className="peer sr-only"
                checked={realEnabled}
                onChange={(e) => setForm({ ...form, executionMode: e.target.checked ? "real" : "mock" })}
              />
              <span className="absolute inset-0 rounded-full bg-slate-300 peer-checked:bg-rose-500 transition" />
              <span className="absolute left-0.5 top-0.5 inline-block h-5 w-5 rounded-full bg-white transition peer-checked:translate-x-5" />
            </span>
          </label>
        </div>
        {realEnabled ? (
          <div className="mt-3 flex items-start gap-2 rounded-lg border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              Modo <b>REAL</b> activado. Los comandos se enviarán al middleware. Los endpoints de escritura en
              Deye están deshabilitados por el proveedor, así que esperás 4xx — útil para demostrar auditoría
              de la respuesta.
            </span>
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-base font-semibold">Comandos permitidos</h2>
        <p className="text-xs text-slate-500">
          Solo los comandos marcados pueden ser sugeridos o ejecutados en esta planta.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {commands.map((c) => {
            const active = form.allowedCommands.includes(c.id);
            return (
              <label
                key={c.id}
                className={
                  "flex cursor-pointer gap-3 rounded-xl border p-3 transition " +
                  (active ? "border-sky-400 bg-sky-50" : "border-slate-200 bg-white hover:border-slate-300")
                }
              >
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggleCommand(c.id)}
                  className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-600 focus:ring-sky-400"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-slate-900">{c.label}</span>
                    <span className={"rounded-full px-2 py-0.5 text-[10px] font-semibold ring-1 " + riskBadge(c.risk)}>
                      {c.risk}
                    </span>
                  </div>
                  <div className="text-xs text-slate-500">{c.description}</div>
                </div>
              </label>
            );
          })}
        </div>
        {autoEnabled && form.allowedCommands.length === 0 ? (
          <div className="mt-3 text-xs text-amber-700">
            Nivel automático sin comandos permitidos = política degradada a <i>approval</i> al guardar.
          </div>
        ) : null}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="font-heading text-base font-semibold">Guardrails</h2>
        <div className="mt-3 grid gap-4 md:grid-cols-2">
          <div>
            <label className="text-xs font-medium uppercase text-slate-500">Rol mínimo para aprobar</label>
            <select
              value={form.requiredApproverRole}
              onChange={(e) =>
                setForm({ ...form, requiredApproverRole: e.target.value as "admin" | "ops" })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            >
              <option value="admin">Solo admin</option>
              <option value="ops">Admin u ops</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-medium uppercase text-slate-500">
              Máximo de acciones ejecutadas por día
            </label>
            <input
              type="number"
              min={0}
              max={500}
              value={form.maxActionsPerDay}
              onChange={(e) =>
                setForm({ ...form, maxActionsPerDay: Number.isFinite(+e.target.value) ? +e.target.value : 0 })
              }
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium uppercase text-slate-500">Notas (opcional)</label>
            <textarea
              value={form.notes ?? ""}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              maxLength={500}
              placeholder="Ej.: planta crítica, no auto-ejecutar entre 22:00 y 05:00"
              className="mt-1 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-sky-500 focus:outline-none focus:ring-2 focus:ring-sky-100"
            />
          </div>
        </div>
      </section>

      <div className="sticky bottom-0 -mx-6 flex items-center justify-between gap-4 border-t border-slate-200 bg-white/95 px-6 py-3 backdrop-blur">
        <div className="text-xs text-slate-500">
          Última actualización: {new Date(form.updatedAt).toLocaleString("es-CO")}
          {saved ? (
            <span className="ml-3 inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" /> Guardado
            </span>
          ) : null}
          {error ? <span className="ml-3 text-rose-600">{error}</span> : null}
        </div>
        <button
          type="button"
          onClick={submit}
          disabled={saving}
          className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-sky-700 disabled:opacity-60"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          Guardar política
        </button>
      </div>
    </div>
  );
}
