"use client";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Cpu,
  MapPin,
  Radio,
  Save,
  ShieldCheck,
  Sparkles,
  Zap,
} from "lucide-react";
import { LocationPicker } from "@/components/sunhub/location-picker";
import { BrandChip } from "@/components/sunhub/brand-chip";
import { cn } from "@/lib/cn";

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

type Step = { key: string; label: string; sub: string; icon: React.ReactNode };
const STEPS: Step[] = [
  { key: "identidad", label: "Identidad", sub: "Cliente", icon: <Building2 className="h-4 w-4" /> },
  { key: "auth", label: "Autenticación", sub: "Proveedor", icon: <ShieldCheck className="h-4 w-4" /> },
  { key: "campos", label: "Campos", sub: "Modelo canónico", icon: <Cpu className="h-4 w-4" /> },
  { key: "prueba", label: "Prueba", sub: "Ping middleware", icon: <Radio className="h-4 w-4" /> },
  { key: "guardar", label: "Guardar", sub: "Confirmación", icon: <Save className="h-4 w-4" /> },
];

const CANONICAL_FIELDS = [
  { canonical: "power_ac_kw", provider: "ac_power_output_watts", status: "detectado" as const },
  { canonical: "voltage_v", provider: "grid_voltage_v", status: "detectado" as const },
  { canonical: "frequency_hz", provider: "grid_freq_hz", status: "detectado" as const },
  { canonical: "status", provider: "status_code", status: "detectado" as const },
  { canonical: "daily_energy_kwh", provider: "daily_energy_kwh", status: "detectado" as const },
  { canonical: "current_a", provider: "— no disponible", status: "no_detectado" as const },
];

const STATUS_STYLES: Record<"detectado" | "no_detectado" | "manual", { bg: string; text: string; label: string }> = {
  detectado: { bg: "bg-emerald-50 text-emerald-700 border-emerald-200", text: "Detectado", label: "Detectado" },
  no_detectado: { bg: "bg-red-50 text-red-700 border-red-200", text: "No detectado", label: "No detectado" },
  manual: { bg: "bg-amber-50 text-amber-700 border-amber-200", text: "Manual", label: "Manual" },
};

const PROVIDER_SAMPLE = {
  device_id: "SLX-001",
  ac_power_output_watts: 2850,
  grid_voltage_v: 220.4,
  grid_freq_hz: 60.0,
  status_code: "online",
  daily_energy_kwh: 19.26,
  internal_temp_c: 46.3,
};

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
  const [flow, setFlow] = useState<"provider" | "client">("provider");

  // === Simulación del ping vivo "Conectado / Cada X min" ===
  const [connected, setConnected] = useState(true);
  const [pingedAt, setPingedAt] = useState<Date>(new Date());
  useEffect(() => {
    const t = setInterval(() => setPingedAt(new Date()), 15_000);
    return () => clearInterval(t);
  }, []);

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

  const completedPct = useMemo(() => {
    const keys: (keyof FormState)[] = [
      "clientName",
      "plantName",
      "plantCode",
      "providerSlug",
      "deviceExternalId",
      "lat",
      "lng",
      "capacityKwp",
    ];
    const filled = keys.filter((k) => (form[k] ?? "").toString().trim().length > 0).length;
    return Math.round((filled / keys.length) * 100);
  }, [form]);

  if (result) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-emerald-200 bg-emerald-50 p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
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
    <div className="space-y-6">
      {/* === Stepper === */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="font-heading text-lg font-semibold text-slate-900">
              Onboarding · Agregar al sistema
            </h2>
            <p className="mt-1 text-sm text-slate-500">Escoge qué quieres integrar</p>
          </div>
          <div className="hidden items-center gap-2 md:flex">
            <button
              type="button"
              onClick={() => setFlow("provider")}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-medium transition",
                flow === "provider"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300",
              )}
            >
              Nuevo proveedor
            </button>
            <button
              type="button"
              onClick={() => setFlow("client")}
              className={cn(
                "rounded-xl border px-3 py-2 text-xs font-medium transition",
                flow === "client"
                  ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                  : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300",
              )}
            >
              Nuevo cliente
            </button>
          </div>
        </div>

        <div className="flex items-center">
          {STEPS.map((s, i) => (
            <div key={s.key} className="flex flex-1 items-center">
              <button
                type="button"
                onClick={() => setStep(i)}
                className="flex items-center gap-2 text-left"
              >
                <span
                  className={cn(
                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border text-xs font-bold transition",
                    i < step && "border-emerald-500 bg-emerald-500 text-white",
                    i === step && "border-emerald-500 bg-emerald-50 text-emerald-700 ring-4 ring-emerald-100",
                    i > step && "border-slate-200 bg-white text-slate-400",
                  )}
                >
                  {i < step ? <CheckCircle2 className="h-4 w-4" /> : i + 1}
                </span>
                <div className="hidden min-w-0 md:block">
                  <div
                    className={cn(
                      "truncate text-sm font-medium",
                      i <= step ? "text-slate-900" : "text-slate-400",
                    )}
                  >
                    {s.label}
                  </div>
                  <div className="truncate text-[10px] uppercase tracking-wider text-slate-400">
                    {s.sub}
                  </div>
                </div>
              </button>
              {i < STEPS.length - 1 ? (
                <div
                  className={cn(
                    "mx-3 h-0.5 flex-1 rounded-full",
                    i < step ? "bg-emerald-500" : "bg-slate-200",
                  )}
                />
              ) : null}
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between text-[11px] text-slate-500">
          <span>
            Paso {step + 1} de {STEPS.length} · {STEPS[step].label}
          </span>
          <span className="font-medium text-slate-700">{completedPct}% completado</span>
        </div>
      </div>

      {/* === Split content === */}
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        {/* Columna izquierda: formulario */}
        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            {step === 0 ? (
              <div className="space-y-4">
                <SectionHeader icon={<Building2 className="h-4 w-4" />} title="Datos del cliente" subtitle="Identidad comercial" />
                <Field label="Nombre del cliente" value={form.clientName} onChange={(v) => update("clientName", v)} placeholder="Bavaria, Éxito, Alpina…" />
                <Field label="Email de contacto" value={form.contactEmail} onChange={(v) => update("contactEmail", v)} placeholder="energia@cliente.com" />
                <Field label="Nombre de la planta" value={form.plantName} onChange={(v) => update("plantName", v)} placeholder="Planta Tibitó" />
                <Field label="Código interno" value={form.plantCode} onChange={(v) => update("plantCode", v)} placeholder="TR-0301" />
                <Field label="Capacidad (kWp)" value={form.capacityKwp} onChange={(v) => update("capacityKwp", v)} placeholder="250" type="number" />
              </div>
            ) : null}

            {step === 1 ? (
              <div className="space-y-4">
                <SectionHeader icon={<ShieldCheck className="h-4 w-4" />} title="Autenticación del proveedor" subtitle="Middleware y credenciales" />
                <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Proveedor</label>
                <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                  {providers.map((p) => (
                    <button
                      key={p.slug}
                      type="button"
                      onClick={() => update("providerSlug", p.slug)}
                      className={cn(
                        "flex items-center justify-between gap-2 rounded-xl border p-3 text-sm transition",
                        form.providerSlug === p.slug
                          ? "border-emerald-500 bg-emerald-50 text-emerald-700 ring-2 ring-emerald-100"
                          : "border-slate-200 bg-white text-slate-600 hover:border-emerald-300",
                      )}
                    >
                      <BrandChip slug={p.slug} size="sm" />
                      {form.providerSlug === p.slug ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : null}
                    </button>
                  ))}
                </div>
                <Field label="External ID (API)" value={form.deviceExternalId} onChange={(v) => update("deviceExternalId", v)} placeholder="1356131" />
                <p className="text-[11px] text-slate-500">
                  El ID que asigna el proveedor (Growatt plant_id, Deye serial…). El worker empezará a poll al próximo ciclo.
                </p>
              </div>
            ) : null}

            {step === 2 ? (
              <div className="space-y-4">
                <SectionHeader icon={<Cpu className="h-4 w-4" />} title="Campos del proveedor" subtitle="Pago requerido: mapeo canónico" />
                <div className="grid gap-4 lg:grid-cols-[1fr_auto_1fr]">
                  <div>
                    <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                      Payload crudo (detectado)
                    </div>
                    <pre className="max-h-72 overflow-auto rounded-xl bg-slate-900 p-4 font-mono text-[11px] leading-relaxed text-emerald-300">
{JSON.stringify(PROVIDER_SAMPLE, null, 2)}
                    </pre>
                    <p className="mt-1 text-[10px] text-emerald-700">Auto-detectar campos</p>
                  </div>
                  <div className="hidden items-center justify-center text-slate-300 lg:flex">
                    <ChevronRight className="h-6 w-6" />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-500">
                        Modelo canónico SunHub
                      </div>
                      <span className="text-[10px] text-slate-500">{CANONICAL_FIELDS.filter((c) => c.status === "detectado").length} completados</span>
                    </div>
                    <div className="space-y-1.5 rounded-xl border border-slate-200 bg-white">
                      {CANONICAL_FIELDS.map((f) => (
                        <div
                          key={f.canonical}
                          className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 border-b border-slate-100 px-3 py-2 text-xs last:border-b-0"
                        >
                          <span className="font-mono text-slate-600">{f.canonical}</span>
                          <span className="text-slate-300">→</span>
                          <div className="flex items-center justify-end gap-2">
                            <span className="truncate font-mono text-[11px] text-slate-500">{f.provider}</span>
                            <span
                              className={cn(
                                "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium",
                                STATUS_STYLES[f.status].bg,
                              )}
                            >
                              {STATUS_STYLES[f.status].label}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ) : null}

            {step === 3 ? (
              <div className="space-y-4">
                <SectionHeader icon={<MapPin className="h-4 w-4" />} title="Ubicación y prueba de ingesta" subtitle="Verificación en vivo" />
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

            {step === 4 ? (
              <div className="space-y-4">
                <SectionHeader icon={<Save className="h-4 w-4" />} title="Revisa y confirma" subtitle="Resumen y contrato" />
                <div className="grid gap-3 md:grid-cols-2">
                  <SummaryItem label="Cliente" value={form.clientName || "—"} />
                  <SummaryItem label="Planta" value={form.plantName || "—"} />
                  <SummaryItem label="Código" value={form.plantCode || "—"} />
                  <SummaryItem label="Capacidad" value={form.capacityKwp ? `${form.capacityKwp} kWp` : "—"} />
                  <SummaryItem label="Proveedor" value={providers.find((p) => p.slug === form.providerSlug)?.displayName ?? form.providerSlug} />
                  <SummaryItem label="External ID" value={form.deviceExternalId || "—"} />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold uppercase tracking-wider text-slate-500">Modalidad</label>
                  <div className="mt-2 grid grid-cols-3 gap-2">
                    {["PPA", "Leasing", "Compra"].map((opt) => (
                      <button
                        key={opt}
                        onClick={() => update("contractType", opt)}
                        className={cn(
                          "rounded-lg border px-3 py-2 text-sm",
                          form.contractType === opt
                            ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                            : "border-slate-200 bg-white text-slate-600",
                        )}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{error}</div>
          ) : null}

          {/* Footer acciones */}
          <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <button
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" /> Anterior
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50"
              >
                Guardar borrador
              </button>
              {step < STEPS.length - 1 ? (
                <button
                  onClick={() => setStep((s) => s + 1)}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700"
                >
                  Siguiente ({STEPS[step + 1]?.label}) <ChevronRight className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={() => void submit()}
                  disabled={submitting}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 disabled:opacity-50"
                >
                  <CheckCircle2 className="h-4 w-4" />
                  {submitting ? "Creando…" : "Crear planta"}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Columna derecha: guía + estado */}
        <aside className="space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Sparkles className="h-4 w-4" />
              </span>
              <div>
                <div className="font-heading text-sm font-semibold text-slate-900">Guía rápida</div>
                <div className="text-[11px] text-slate-500">Tips del paso actual</div>
              </div>
            </div>
            <ul className="mt-3 space-y-2 text-xs text-slate-600">
              {step === 0 ? (
                <>
                  <li>· Nombres humanos facilitan comunicaciones con el cliente.</li>
                  <li>· El código interno debe coincidir con el de facturación.</li>
                </>
              ) : null}
              {step === 1 ? (
                <>
                  <li>· Growatt/Huawei: usa plant_id de la API oficial.</li>
                  <li>· Deye/Solarman: usa el serial del inversor.</li>
                </>
              ) : null}
              {step === 2 ? (
                <>
                  <li>· Los campos no detectados pueden mapearse a mano.</li>
                  <li>· SunHub unifica 6 proveedores en un solo modelo.</li>
                </>
              ) : null}
              {step === 3 ? (
                <>
                  <li>· Arrastra el pin para ajustar la ubicación exacta.</li>
                  <li>· El clima se cruza con la lat/lng al guardar.</li>
                </>
              ) : null}
              {step === 4 ? (
                <>
                  <li>· Revisa antes de guardar · cambios mayores requieren re-onboarding.</li>
                  <li>· La planta empieza a reportar en el próximo ciclo.</li>
                </>
              ) : null}
            </ul>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="flex items-center gap-2">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <Radio className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-heading text-sm font-semibold text-slate-900">Estado</div>
                <div className="text-[11px] text-slate-500">Conectividad al middleware</div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setConnected((c) => !c);
                  setPingedAt(new Date());
                }}
                className={cn(
                  "rounded-full border px-2 py-0.5 text-[10px] font-medium",
                  connected ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-red-200 bg-red-50 text-red-700",
                )}
              >
                {connected ? "Conectado" : "Caído"}
              </button>
            </div>
            <dl className="mt-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Bearer Token</dt>
                <dd className="font-mono text-slate-800">••••ok</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Cada</dt>
                <dd className="font-medium text-slate-800">5 min</dd>
              </div>
              <div className="flex items-center justify-between">
                <dt className="text-slate-500">Último ping</dt>
                <dd className="font-medium text-slate-800">
                  {pingedAt.toLocaleTimeString("es-CO", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </dd>
              </div>
            </dl>
            <div className="mt-3 rounded-lg border border-slate-200 bg-slate-900 p-3 font-mono text-[10px] leading-relaxed text-emerald-300">
{`{
  "ok": true,
  "provider": "${form.providerSlug}",
  "latency_ms": ${120 + (pingedAt.getSeconds() % 30)},
  "ts": "${pingedAt.toISOString().slice(0, 19)}Z"
}`}
            </div>
          </div>

          <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-sm">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wider text-emerald-100">
              <Zap className="h-4 w-4" /> Impacto esperado
            </div>
            <div className="mt-2 font-heading text-xl font-bold">&lt; 10 min</div>
            <p className="mt-1 text-xs text-emerald-50/90">
              Para dejar la planta reportando en tiempo real. Sin tickets manuales.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}

function SectionHeader({
  icon,
  title,
  subtitle,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-slate-100 pb-3">
      <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
        {icon}
      </span>
      <div>
        <h3 className="font-heading text-base font-semibold text-slate-900">{title}</h3>
        <p className="text-[11px] text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-0.5 text-sm font-medium text-slate-900">{value}</div>
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
      <div className="mb-1 text-[11px] font-semibold uppercase tracking-wider text-slate-500">{label}</div>
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
