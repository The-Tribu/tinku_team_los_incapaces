"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { FlaskConical, Loader2, Zap } from "lucide-react";

type Plant = { id: string; code: string; name: string };

type Severity = "critical" | "warning" | "info";
type AlarmType = "offline" | "provider" | "voltage" | "frequency" | "low_gen" | "temperature";

export function MockAlarmTrigger({ plants }: { plants: Plant[] }) {
  const router = useRouter();
  const defaultPlant = plants.find((p) => p.code === "TR-001")?.id ?? plants[0]?.id ?? "";
  const [plantId, setPlantId] = useState(defaultPlant);
  const [severity, setSeverity] = useState<Severity>("critical");
  const [type, setType] = useState<AlarmType>("offline");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fire = async () => {
    setSending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/dev/mock-alarm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plantId, severity, type }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Error al disparar alarma");
      setResult(
        `OK · ${j.plant.code} · email enviados=${j.fanout?.email?.sent ?? 0} · skipped=${j.fanout?.email?.skipped ?? 0}`,
      );
      router.refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSending(false);
    }
  };

  if (plants.length === 0) return null;

  return (
    <section className="rounded-2xl border border-amber-200 bg-amber-50/70 px-4 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <FlaskConical className="h-3.5 w-3.5" />
          </span>
          <div>
            <p className="font-semibold text-amber-900">Modo demo — disparar alarma de prueba</p>
            <p className="text-[11px] text-amber-800/80">
              Solo visible para admin/ops. Inserta una alarma sintética y dispara fanout.
            </p>
          </div>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <select
            value={plantId}
            onChange={(e) => setPlantId(e.target.value)}
            className="h-8 rounded-md border border-amber-200 bg-white px-2 text-xs outline-none"
          >
            {plants.map((p) => (
              <option key={p.id} value={p.id}>
                {p.code} · {p.name}
              </option>
            ))}
          </select>
          <select
            value={severity}
            onChange={(e) => setSeverity(e.target.value as Severity)}
            className="h-8 rounded-md border border-amber-200 bg-white px-2 text-xs outline-none"
          >
            <option value="critical">critical</option>
            <option value="warning">warning</option>
            <option value="info">info</option>
          </select>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as AlarmType)}
            className="h-8 rounded-md border border-amber-200 bg-white px-2 text-xs outline-none"
          >
            <option value="offline">offline</option>
            <option value="provider">provider</option>
            <option value="voltage">voltage</option>
            <option value="frequency">frequency</option>
            <option value="low_gen">low_gen</option>
            <option value="temperature">temperature</option>
          </select>
          <button
            type="button"
            onClick={fire}
            disabled={sending || !plantId}
            className="inline-flex h-8 items-center gap-1 rounded-md bg-amber-600 px-3 text-xs font-semibold text-white transition hover:bg-amber-700 disabled:opacity-50"
          >
            {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            Disparar
          </button>
        </div>
      </div>
      {result ? (
        <p className="mt-2 text-[11px] font-medium text-emerald-700">{result}</p>
      ) : null}
      {error ? <p className="mt-2 text-[11px] font-medium text-rose-700">{error}</p> : null}
    </section>
  );
}
