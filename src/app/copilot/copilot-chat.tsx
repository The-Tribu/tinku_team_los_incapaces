"use client";
import { useRef, useState } from "react";
import {
  ArrowRight,
  Download,
  FileText,
  Send,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import { KpiCard } from "@/components/sunhub/kpi-card";
import { SectionCard } from "@/components/sunhub/section-card";
import { StatusBadge } from "@/components/sunhub/status-badge";
import { cn } from "@/lib/cn";

type Msg = { role: "user" | "assistant"; content: string };

type ReportItem = {
  id: string;
  title: string;
  plantName: string;
  plantCode: string;
  clientName: string;
  status: string;
  generatedAt: string;
};

type Props = {
  reports: ReportItem[];
  kpis: { hoursSaved: number; hoursTarget: number; reportsGenerated: number };
};

const STARTERS = [
  "¿Qué clientes tienen mayor riesgo de penalización este mes?",
  "Genera reporte mensual Grupo Éxito",
  "¿Cuál es la planta con peor Performance Ratio?",
  "¿Qué alarmas críticas debería atender primero?",
];

const QUICK_ACTIONS = [
  "Comparar Growatt vs Huawei",
  "Alertas de generación Q3",
  "Mejor planta del mes",
];

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-CO", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function mapStatus(status: string): string {
  if (status === "sent") return "online";
  if (status === "generating") return "warning";
  return "unknown";
}

export function CopilotChat({ reports, kpis }: Props) {
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
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      {/* === Columna izquierda: chat === */}
      <div className="flex min-h-[calc(100vh-10rem)] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <header className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Sparkles className="h-4 w-4" />
            </span>
            <div>
              <div className="font-heading text-sm font-semibold text-slate-900">Copilot AI</div>
              <div className="text-[11px] text-slate-500">Pregunta en lenguaje natural sobre tu flota solar</div>
            </div>
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-500" />
            En línea
          </span>
        </header>

        <div ref={listRef} className="flex-1 space-y-4 overflow-y-auto bg-slate-50/40 p-5">
          {messages.length === 0 ? (
            <div className="space-y-4">
              <div className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50 to-white p-5">
                <div className="flex items-center gap-2 text-emerald-700">
                  <Sparkles className="h-4 w-4" />
                  <span className="font-heading text-base font-semibold">Hola, soy SunHub Copilot</span>
                </div>
                <p className="mt-1 text-sm text-slate-600">
                  Tengo acceso en vivo al estado de plantas, alarmas y generación. Prueba con una de estas preguntas:
                </p>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    onClick={() => void send(s)}
                    className="group flex items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left text-sm text-slate-700 transition hover:border-emerald-300 hover:bg-emerald-50"
                  >
                    <span>{s}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:text-emerald-600" />
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
                  <div className="max-w-[85%] rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-3 text-sm text-slate-800 shadow-sm">
                    <div className="mb-1 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-emerald-700">
                      <Sparkles className="h-3 w-3" /> Copilot analysis
                    </div>
                    <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                  </div>
                ) : (
                  <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-slate-800 px-4 py-2.5 text-sm text-white shadow-sm">
                    {m.content}
                  </div>
                )}
              </div>
            ))
          )}
          {busy ? (
            <div className="flex justify-start">
              <div className="rounded-2xl rounded-tl-sm border border-slate-200 bg-white px-4 py-2.5 text-sm text-slate-500 shadow-sm">
                <span className="inline-flex gap-1">
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.3s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400 [animation-delay:-0.15s]" />
                  <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-emerald-400" />
                </span>
              </div>
            </div>
          ) : null}
        </div>

        {/* Quick actions */}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 bg-white px-5 py-3">
          {QUICK_ACTIONS.map((q) => (
            <button
              key={q}
              onClick={() => void send(q)}
              disabled={busy}
              className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600 transition hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700 disabled:opacity-50"
            >
              {q}
            </button>
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (input.trim() && !busy) void send(input.trim());
          }}
          className="flex gap-2 border-t border-slate-100 bg-white p-3"
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Escribe tu pregunta…"
            disabled={busy}
            className="flex-1 rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 text-sm focus:border-emerald-500 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-100 disabled:opacity-60"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
          >
            <Send className="h-3.5 w-3.5" /> Enviar
          </button>
        </form>
      </div>

      {/* === Columna derecha: reportes automáticos === */}
      <aside className="flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h2 className="font-heading text-sm font-semibold uppercase tracking-wider text-slate-600">
            Reportes automáticos
          </h2>
          <span className="text-[10px] uppercase text-slate-400">Centro documental</span>
        </div>

        <KpiCard
          label="Horas ahorradas este mes"
          value={kpis.hoursSaved}
          unit={`/ ${kpis.hoursTarget} h`}
          tone="primary"
          icon={<TrendingUp className="h-4 w-4" />}
          hint="vs. reportes manuales de 40 min/planta"
        />
        <KpiCard
          label="Reportes generados"
          value={kpis.reportsGenerated}
          unit="este mes"
          tone="info"
          icon={<FileText className="h-4 w-4" />}
          hint="Tasa entrega 98%"
          compact
        />

        <SectionCard
          title="Reportes recientes"
          subtitle="Últimos PDFs enviados al cliente"
          bodyClassName="max-h-[22rem] overflow-y-auto space-y-2"
        >
          {reports.length === 0 ? (
            <p className="py-6 text-center text-xs text-slate-500">
              Aún no hay reportes. Pide uno al Copilot.
            </p>
          ) : (
            reports.map((r) => (
              <div
                key={r.id}
                className="flex items-start gap-3 rounded-xl border border-slate-100 bg-white p-3 transition hover:border-emerald-200 hover:bg-emerald-50/40"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700">
                  <FileText className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-slate-900">{r.title}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                    <span className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">
                      {r.plantCode || r.clientName}
                    </span>
                    <span>·</span>
                    <span>{formatDate(r.generatedAt)}</span>
                  </div>
                </div>
                <StatusBadge status={mapStatus(r.status)} className="mt-1" />
                <button
                  type="button"
                  className="mt-0.5 rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-emerald-700"
                  aria-label="Descargar PDF"
                >
                  <Download className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </SectionCard>

        <button
          type="button"
          onClick={() => void send("Genera un nuevo reporte ejecutivo del mes")}
          disabled={busy}
          className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:opacity-50"
        >
          <Sparkles className="h-4 w-4" /> Generar nuevo reporte
        </button>

        <div className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-600 to-emerald-700 p-5 text-white shadow-sm">
          <div className="text-[11px] font-semibold uppercase tracking-wider text-emerald-100">
            Impacto operativo
          </div>
          <div className="mt-2 font-heading text-2xl font-bold">
            ROI: {kpis.hoursSaved} horas/mes
          </div>
          <p className="mt-1 text-xs text-emerald-50/90">
            Recuperadas automáticamente con Copilot — el equipo las invierte en mantenimiento
            proactivo en vez de armar PDFs.
          </p>
        </div>
      </aside>
    </div>
  );
}
