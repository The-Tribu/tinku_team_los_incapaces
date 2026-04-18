"use client";

import { useState } from "react";
import { ArrowRight, FileBarChart, Headphones, Receipt, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

const QUICK_ACTIONS = [
  {
    id: "report",
    label: "Reporte mensual",
    icon: FileBarChart,
    prompt: "Prepárame el reporte mensual de mi planta",
  },
  {
    id: "support",
    label: "Hablar con un técnico",
    icon: Headphones,
    prompt: "Necesito hablar con un técnico",
  },
  {
    id: "invoice",
    label: "Ver mi factura",
    icon: Receipt,
    prompt: "Muéstrame mi factura más reciente",
  },
];

/**
 * Teaser del asistente. No dispara ninguna llamada real todavía: solo guarda
 * la consulta en estado local para que el cliente la vea y entienda el canal.
 */
export function AssistantCard() {
  const [value, setValue] = useState("");
  const [lastSent, setLastSent] = useState<string | null>(null);

  const send = (text: string) => {
    if (!text.trim()) return;
    setLastSent(text.trim());
    setValue("");
  };

  return (
    <div className="rounded-2xl border border-emerald-100 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
          <Sparkles className="h-4 w-4" />
        </span>
        <div>
          <div className="font-heading text-sm font-semibold text-slate-900">
            Asistente SunHub
          </div>
          <div className="text-[11px] text-slate-500">
            Pregúntame cualquier cosa sobre tu planta
          </div>
        </div>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(value);
        }}
        className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-slate-50 px-4 py-2"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="text"
          placeholder="¿Cuánto he ahorrado este año?"
          className="min-w-0 flex-1 bg-transparent text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white transition",
            value.trim()
              ? "bg-emerald-600 hover:bg-emerald-700"
              : "bg-emerald-300 cursor-not-allowed",
          )}
          aria-label="Enviar pregunta"
        >
          <ArrowRight className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-3 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((a) => {
          const Icon = a.icon;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => send(a.prompt)}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
            >
              <Icon className="h-3.5 w-3.5" />
              {a.label}
            </button>
          );
        })}
      </div>

      {lastSent ? (
        <div className="mt-3 rounded-lg bg-emerald-50 px-3 py-2 text-[11px] text-emerald-700">
          Tu consulta se envió: <span className="font-semibold">&ldquo;{lastSent}&rdquo;</span>.
          Un asesor te responderá pronto.
        </div>
      ) : null}
    </div>
  );
}
