"use client";
import { useState } from "react";
import { LocationPicker } from "@/components/sunhub/location-picker";

type Provider = { slug: string; displayName: string };
type FormState = {
  clientName: string;
  contactEmail: string;
  plantName: string;
  plantCode: string;
  region: string;
  lat: string;
  lng: string;
  capacityKwp: string;
  contractType: string;
  providerSlug: string;
  deviceExternalId: string;
};

const STEPS = ["Cliente", "Planta", "Ubicación", "Contrato", "Dispositivo"];

export function OnboardingWizard({ providers }: { providers: Provider[] }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormState>({
    clientName: "",
    contactEmail: "",
    plantName: "",
    plantCode: "",
    region: "",
    lat: "",
    lng: "",
    capacityKwp: "",
    contractType: "PPA",
    providerSlug: providers[0]?.slug ?? "growatt",
    deviceExternalId: "",
  });
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<{ plant: { id: string; name: string; code: string }; next: { message: string; checkUrl: string } } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const update = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          capacityKwp: Number(form.capacityKwp) || 0,
          lat: form.lat ? Number(form.lat) : undefined,
          lng: form.lng ? Number(form.lng) : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "Error");
      setResult(json);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSubmitting(false);
    }
  }

  if (result) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <div className="text-5xl">✓</div>
        <h2 className="mt-3 font-heading text-xl font-bold text-emerald-800">Planta creada</h2>
        <div className="mt-1 text-sm text-slate-700">
          <b>{result.plant.code}</b> · {result.plant.name}
        </div>
        <p className="mt-4 text-xs text-slate-600">{result.next.message}</p>
        <a
          href={result.next.checkUrl}
          className="mt-5 inline-block rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
        >
          Ver planta →
        </a>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="mb-4 flex items-center justify-between">
        {STEPS.map((s, i) => (
          <div key={s} className="flex flex-1 items-center">
            <div
              className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold ${
                i <= step ? "bg-emerald-600 text-white" : "bg-slate-200 text-slate-500"
              }`}
            >
              {i + 1}
            </div>
            <div className="ml-2 hidden text-xs font-medium text-slate-600 md:block">{s}</div>
            {i < STEPS.length - 1 ? (
              <div className={`mx-2 h-0.5 flex-1 ${i < step ? "bg-emerald-600" : "bg-slate-200"}`} />
            ) : null}
          </div>
        ))}
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        {step === 0 ? (
          <div className="space-y-3">
            <h3 className="font-heading text-base font-semibold">Datos del cliente</h3>
            <Field label="Nombre del cliente" value={form.clientName} onChange={(v) => update("clientName", v)} placeholder="Bavaria, Éxito, Alpina…" />
            <Field label="Email de contacto" value={form.contactEmail} onChange={(v) => update("contactEmail", v)} placeholder="energia@cliente.com" />
          </div>
        ) : null}

        {step === 1 ? (
          <div className="space-y-3">
            <h3 className="font-heading text-base font-semibold">Datos de la planta</h3>
            <Field label="Nombre de la planta" value={form.plantName} onChange={(v) => update("plantName", v)} placeholder="Planta Tibitó" />
            <Field label="Código interno" value={form.plantCode} onChange={(v) => update("plantCode", v)} placeholder="TR-0301" />
            <Field label="Capacidad (kWp)" value={form.capacityKwp} onChange={(v) => update("capacityKwp", v)} placeholder="250" type="number" />
          </div>
        ) : null}

        {step === 2 ? (
          <div className="space-y-3">
            <h3 className="font-heading text-base font-semibold">Ubicación</h3>
            <Field label="Región" value={form.region} onChange={(v) => update("region", v)} placeholder="Cundinamarca" />
            <LocationPicker
              lat={form.lat}
              lng={form.lng}
              region={form.region}
              onChange={(lat, lng) => setForm((f) => ({ ...f, lat, lng }))}
            />
            <div className="grid grid-cols-2 gap-3">
              <Field label="Latitud" value={form.lat} onChange={(v) => update("lat", v)} placeholder="4.60" />
              <Field label="Longitud" value={form.lng} onChange={(v) => update("lng", v)} placeholder="-74.07" />
            </div>
          </div>
        ) : null}

        {step === 3 ? (
          <div className="space-y-3">
            <h3 className="font-heading text-base font-semibold">Contrato</h3>
            <label className="block text-xs font-medium uppercase text-slate-500">Modalidad</label>
            <div className="grid grid-cols-3 gap-2">
              {["PPA", "Leasing", "Compra"].map((opt) => (
                <button
                  key={opt}
                  onClick={() => update("contractType", opt)}
                  className={`rounded-lg border px-3 py-2 text-sm ${
                    form.contractType === opt ? "border-emerald-500 bg-emerald-50 text-emerald-700" : "border-slate-200 bg-white text-slate-600"
                  }`}
                >
                  {opt}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {step === 4 ? (
          <div className="space-y-3">
            <h3 className="font-heading text-base font-semibold">Dispositivo / Inversor</h3>
            <label className="block text-xs font-medium uppercase text-slate-500">Proveedor</label>
            <select
              value={form.providerSlug}
              onChange={(e) => update("providerSlug", e.target.value)}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
            >
              {providers.map((p) => (
                <option key={p.slug} value={p.slug}>
                  {p.displayName}
                </option>
              ))}
            </select>
            <Field label="External ID (API)" value={form.deviceExternalId} onChange={(v) => update("deviceExternalId", v)} placeholder="1356131" />
            <p className="text-[11px] text-slate-500">
              El ID que asigna el proveedor (Growatt plant_id, Deye serial, etc.). Nuestro worker
              empezará a poll al próximo ciclo.
            </p>
          </div>
        ) : null}

        {error ? <p className="mt-3 text-xs text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-between border-t border-slate-100 pt-4">
          <button
            onClick={() => setStep((s) => Math.max(0, s - 1))}
            disabled={step === 0}
            className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            ← Atrás
          </button>
          {step < STEPS.length - 1 ? (
            <button
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Siguiente →
            </button>
          ) : (
            <button
              onClick={() => void submit()}
              disabled={submitting}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {submitting ? "Creando…" : "✓ Crear planta"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  type,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <div className="mb-1 text-xs font-medium uppercase text-slate-500">{label}</div>
      <input
        type={type ?? "text"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
      />
    </label>
  );
}
