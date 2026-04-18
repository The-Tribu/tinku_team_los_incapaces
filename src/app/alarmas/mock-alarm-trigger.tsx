"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Loader2, Zap } from "lucide-react";

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
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs">
      <span className="font-semibold text-amber-800">Disparar alarma de prueba</span>
      <select
        value={plantId}
        onChange={(e) => setPlantId(e.target.value)}
        className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs"
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
        className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs"
      >
        <option value="critical">critical</option>
        <option value="warning">warning</option>
        <option value="info">info</option>
      </select>
      <select
        value={type}
        onChange={(e) => setType(e.target.value as AlarmType)}
        className="rounded-md border border-amber-200 bg-white px-2 py-1 text-xs"
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
        className="inline-flex items-center gap-1 rounded-md bg-amber-600 px-3 py-1 text-xs font-semibold text-white hover:bg-amber-700 disabled:opacity-50"
      >
        {sending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
        Disparar
      </button>
      {result ? <span className="text-emerald-700">{result}</span> : null}
      {error ? <span className="text-rose-700">{error}</span> : null}
    </div>
  );
}
