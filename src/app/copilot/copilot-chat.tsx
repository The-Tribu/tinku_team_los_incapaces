"use client";
import { useRef, useState } from "react";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "¿Qué plantas están en riesgo ahora mismo?",
  "Genera un reporte ejecutivo de la última semana",
  "¿Cuál es la planta con peor Performance Ratio?",
  "¿Qué alarmas críticas debería atender primero?",
];

export function CopilotChat() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  async function send(prompt: string) {
    const userMsg: Msg = { role: "user", content: prompt };
    const next = [...messages, userMsg];
    setMessages(next);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      const json = await res.json();
      const answer: Msg = {
        role: "assistant",
        content: json.answer ?? json.error ?? "Sin respuesta.",
      };
      setMessages([...next, answer]);
    } catch (err) {
      setMessages([
        ...next,
        { role: "assistant", content: `Error: ${(err as Error).message}` },
      ]);
    } finally {
      setBusy(false);
      requestAnimationFrame(() => listRef.current?.scrollTo({ top: 9e6, behavior: "smooth" }));
    }
  }

  return (
    <div className="flex h-[calc(100vh-10rem)] flex-col rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto p-5">
        {messages.length === 0 ? (
          <div>
            <div className="rounded-xl bg-gradient-to-br from-emerald-50 to-white p-5">
              <div className="flex items-center gap-2 text-emerald-700">
                <span className="text-xl">✦</span>
                <span className="font-heading text-lg font-semibold">SunHub Copilot</span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Pregunta lo que sea sobre tu flota solar. Tengo acceso en vivo al estado de
                plantas, alarmas y generación.
              </p>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-2 md:grid-cols-2">
              {STARTERS.map((s) => (
                <button
                  key={s}
                  onClick={() => void send(s)}
                  className="rounded-xl border border-slate-200 bg-white p-3 text-left text-sm text-slate-700 hover:border-emerald-300 hover:bg-emerald-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={i}
              className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm ${
                  m.role === "user"
                    ? "bg-emerald-600 text-white"
                    : "bg-slate-100 text-slate-900"
                }`}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {busy ? (
          <div className="flex justify-start">
            <div className="rounded-2xl bg-slate-100 px-4 py-2.5 text-sm text-slate-500">
              <span className="inline-flex gap-1">
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.3s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400 [animation-delay:-0.15s]" />
                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-slate-400" />
              </span>
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (input.trim() && !busy) void send(input.trim());
        }}
        className="flex gap-2 border-t border-slate-200 p-3"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Pregunta al copilot…"
          disabled={busy}
          className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          Enviar
        </button>
      </form>
    </div>
  );
}
