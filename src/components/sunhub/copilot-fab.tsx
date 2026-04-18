"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  ArrowRight,
  Bot,
  Maximize2,
  MessageCircle,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";

type Msg = { role: "user" | "assistant"; content: string };

const STARTERS = [
  "¿Qué clientes tienen mayor riesgo de penalización este mes?",
  "¿Cuál es la planta con peor Performance Ratio?",
  "¿Qué alarmas críticas debería atender primero?",
  "Comparar Growatt vs Huawei",
];

const QUICK_ACTIONS = [
  "Alertas de generación Q3",
  "Mejor planta del mes",
  "Generar reporte ejecutivo",
];

/**
 * Copilot global como FAB. Se monta una sola vez en AppShell y está disponible
 * en cualquier pantalla. El estado del chat vive en el componente (sin persistir
 * entre navegaciones duras) — suficiente para consultas rápidas dentro de una
 * misma sesión de trabajo.
 */
export function CopilotFab() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [mounted, setMounted] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => setMounted(true), []);

  // Cerrar con Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Autoscroll al último mensaje.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() =>
      listRef.current?.scrollTo({ top: 9e6, behavior: "smooth" }),
    );
  }, [messages, busy, open]);

  async function send(prompt: string) {
    if (!prompt.trim() || busy) return;
    const userMsg: Msg = { role: "user", content: prompt };
    const next = [...messages, userMsg];
    setMessages([...next, { role: "assistant", content: "" }]);
    setInput("");
    setBusy(true);
    try {
      const res = await fetch("/api/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `HTTP ${res.status}`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = "";
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: acc };
          return copy;
        });
      }
      if (acc.length === 0) {
        setMessages((prev) => {
          const copy = prev.slice();
          copy[copy.length - 1] = { role: "assistant", content: "Sin respuesta." };
          return copy;
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMessages((prev) => {
        const copy = prev.slice();
        copy[copy.length - 1] = { role: "assistant", content: `Error: ${msg}` };
        return copy;
      });
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    setMessages([]);
    setInput("");
  }

  // Siempre renderizamos el botón. El drawer sólo cuando está abierto y
  // el portal ya existe en el DOM (evita hidratación en SSR).
  return (
    <>
      <button
        type="button"
        aria-label="Abrir Copilot AI"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed bottom-6 right-6 z-[1000] flex h-14 w-14 items-center justify-center rounded-full",
          "bg-gradient-to-br from-emerald-500 to-emerald-700 text-white shadow-lg shadow-emerald-900/20",
          "transition hover:scale-105 hover:shadow-xl hover:shadow-emerald-900/30",
          "focus:outline-none focus:ring-4 focus:ring-emerald-200",
          open && "scale-95 opacity-0 pointer-events-none",
        )}
      >
        <Bot className="h-6 w-6" />
        <span className="absolute -top-1 -right-1 inline-flex items-center gap-0.5 rounded-full bg-amber-400 px-1.5 py-[1px] text-[9px] font-bold text-amber-900 shadow">
          <Sparkles className="h-2.5 w-2.5" />
          AI
        </span>
      </button>

      {mounted && open
        ? createPortal(
            <div
              className="fixed inset-0 z-[1050] flex items-end justify-end sm:items-stretch"
              role="dialog"
              aria-modal="true"
              aria-label="Copilot AI"
            >
              {/* Backdrop */}
              <div
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-[2px]"
                onClick={() => setOpen(false)}
              />

              {/* Drawer */}
              <div
                className={cn(
                  "relative flex w-full flex-col bg-white shadow-2xl",
                  "sm:w-[440px] sm:rounded-l-2xl",
                  "max-h-[85vh] rounded-t-2xl sm:max-h-none sm:rounded-t-none",
                )}
              >
                {/* Header */}
                <header className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
                  <div className="flex items-center gap-2">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
                      <Bot className="h-4 w-4" />
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5 font-heading text-sm font-semibold text-slate-900">
                        SunHub Copilot
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-1.5 py-[1px] text-[9px] font-semibold uppercase tracking-wider text-emerald-700 ring-1 ring-emerald-200">
                          <span className="h-1 w-1 animate-pulse rounded-full bg-emerald-500" />
                          En línea
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Pregunta en lenguaje natural sobre tu flota solar
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {messages.length > 0 ? (
                      <button
                        type="button"
                        onClick={reset}
                        className="rounded-md px-2 py-1 text-[11px] font-medium text-slate-500 transition hover:bg-slate-100 hover:text-slate-700"
                        title="Nueva conversación"
                      >
                        Nueva
                      </button>
                    ) : null}
                    <a
                      href="/copilot"
                      className="hidden rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 sm:inline-flex"
                      title="Abrir vista completa"
                      aria-label="Abrir vista completa"
                    >
                      <Maximize2 className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Cerrar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </header>

                {/* Mensajes */}
                <div
                  ref={listRef}
                  className="flex-1 space-y-3 overflow-y-auto bg-slate-50/50 p-4"
                >
                  {messages.length === 0 ? (
                    <div className="space-y-3">
                      <div className="rounded-xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-4">
                        <div className="flex items-center gap-2 text-emerald-700">
                          <Sparkles className="h-4 w-4" />
                          <span className="font-heading text-sm font-semibold">
                            Hola, soy SunHub Copilot
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-slate-600">
                          Tengo acceso en vivo al estado de plantas, alarmas y
                          generación. Empieza con una de estas preguntas:
                        </p>
                      </div>
                      <div className="grid grid-cols-1 gap-2">
                        {STARTERS.map((s) => (
                          <button
                            key={s}
                            onClick={() => void send(s)}
                            className="group flex items-start justify-between gap-2 rounded-xl border border-slate-200 bg-white p-2.5 text-left text-xs text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                          >
                            <span>{s}</span>
                            <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:text-emerald-600" />
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : (
                    messages.map((m, i) => (
                      <div
                        key={i}
                        className={cn(
                          "flex",
                          m.role === "user" ? "justify-end" : "justify-start",
                        )}
                      >
                        {m.role === "assistant" ? (
                          <div className="max-w-[90%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 shadow-sm">
                            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-emerald-700">
                              <Sparkles className="h-3 w-3" /> Copilot
                            </div>
                            {m.content.length === 0 ? (
                              <span className="inline-flex gap-1 py-1">
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                                <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
                              </span>
                            ) : (
                              <div className="whitespace-pre-wrap text-xs leading-relaxed">
                                {m.content}
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="max-w-[90%] rounded-2xl rounded-tr-sm bg-slate-800 px-3.5 py-2 text-xs text-white shadow-sm">
                            {m.content}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>

                {/* Quick actions */}
                {messages.length === 0 ? null : (
                  <div className="flex flex-wrap gap-1.5 border-t border-slate-100 bg-white px-3 py-2">
                    {QUICK_ACTIONS.map((q) => (
                      <button
                        key={q}
                        onClick={() => void send(q)}
                        disabled={busy}
                        className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[11px] font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}

                {/* Input */}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (input.trim() && !busy) void send(input.trim());
                  }}
                  className="flex gap-2 border-t border-slate-200 bg-white p-3"
                >
                  <div className="relative flex-1">
                    <MessageCircle className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                    <input
                      value={input}
                      onChange={(e) => setInput(e.target.value)}
                      placeholder="Escribe tu pregunta…"
                      disabled={busy}
                      autoFocus
                      className="w-full rounded-lg border border-slate-200 bg-slate-50 py-2 pl-9 pr-3 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={busy || !input.trim()}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
                    aria-label="Enviar"
                  >
                    <Send className="h-3.5 w-3.5" />
                  </button>
                </form>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
