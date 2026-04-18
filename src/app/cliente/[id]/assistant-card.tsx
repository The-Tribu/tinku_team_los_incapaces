"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";
import { cn } from "@/lib/cn";

const QUICK_ACTIONS = [
  { id: "invoice", label: "Ver mi factura de ahorro" },
  { id: "report", label: "Reporte mensual" },
  { id: "support", label: "Hablar con un técnico" },
];

/**
 * Teaser del asistente del cliente. No dispara ninguna llamada real todavía:
 * guarda la consulta en estado local y muestra una confirmación visual.
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
    <div className="rounded-[1.8rem] bg-m3-surface-container-high p-6">
      <div className="flex items-center gap-2">
        <Sparkles className="h-5 w-5 text-m3-primary" />
        <h3 className="font-heading text-base font-bold text-m3-on-surface">
          Asistente SunHub ✨
        </h3>
      </div>
      <p className="mt-1 text-xs text-m3-outline">
        Pregúntame cualquier cosa sobre tu planta
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(value);
        }}
        className="relative mt-4"
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          type="text"
          placeholder="¿Cuánto he ahorrado este año?"
          className="w-full rounded-2xl border-none bg-m3-surface-container-lowest px-4 py-3 pr-12 text-sm text-m3-on-surface placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-m3-primary/30"
        />
        <button
          type="submit"
          disabled={!value.trim()}
          aria-label="Enviar pregunta"
          className={cn(
            "absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-xl text-white transition",
            value.trim()
              ? "bg-m3-primary hover:bg-m3-primary-container"
              : "cursor-not-allowed bg-m3-primary/40",
          )}
        >
          <Send className="h-4 w-4" />
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-2">
        {QUICK_ACTIONS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => send(a.label)}
            className="rounded-xl bg-white px-3 py-2 text-[10px] font-semibold text-m3-on-surface shadow-sm transition hover:bg-m3-surface-container-low"
          >
            {a.label}
          </button>
        ))}
      </div>

      {lastSent ? (
        <div className="mt-3 rounded-xl bg-m3-surface-container-low px-3 py-2 text-[11px] text-m3-primary">
          Tu consulta se envió:{" "}
          <span className="font-semibold">&ldquo;{lastSent}&rdquo;</span>. Un
          asesor te responderá pronto.
        </div>
      ) : null}
    </div>
  );
}
