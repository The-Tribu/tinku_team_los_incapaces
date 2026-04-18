import { cn } from "@/lib/cn";
import type { ReactNode } from "react";
import { Sparkline } from "./sparkline";

type Tone = "primary" | "info" | "warning" | "danger" | "violet" | "neutral";

type Props = {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { value: string; positive?: boolean };
  tone?: Tone;
  icon?: ReactNode;
  spark?: number[];
  hint?: string;
  compact?: boolean;
};

const TONES: Record<Tone, string> = {
  primary: "from-emerald-50/70 to-white",
  info: "from-sky-50/70 to-white",
  warning: "from-amber-50/70 to-white",
  danger: "from-red-50/70 to-white",
  violet: "from-violet-50/70 to-white",
  neutral: "from-slate-50/60 to-white",
};

const ICON_BG: Record<Tone, string> = {
  primary: "bg-emerald-100 text-emerald-700",
  info: "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  violet: "bg-violet-100 text-violet-700",
  neutral: "bg-slate-100 text-slate-700",
};

const SPARK: Record<Tone, { stroke: string; fill: string }> = {
  primary: { stroke: "#16a34a", fill: "#16a34a" },
  info: { stroke: "#0ea5e9", fill: "#0ea5e9" },
  warning: { stroke: "#f59e0b", fill: "#f59e0b" },
  danger: { stroke: "#dc2626", fill: "#dc2626" },
  violet: { stroke: "#8b5cf6", fill: "#8b5cf6" },
  neutral: { stroke: "#64748b", fill: "#64748b" },
};

export function KpiCard({
  label,
  value,
  unit,
  delta,
  tone = "neutral",
  icon,
  spark,
  hint,
  compact = false,
}: Props) {
  return (
    <div
      className={cn(
        "relative overflow-hidden rounded-2xl border border-slate-200/70 bg-gradient-to-b shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition hover:shadow-md",
        TONES[tone],
        compact ? "p-4" : "p-5",
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {icon ? <span className={cn("rounded-lg p-1.5", ICON_BG[tone])}>{icon}</span> : null}
      </div>
      <div className={cn("mt-2 flex items-baseline gap-1", compact && "mt-1")}>
        <span className={cn("font-heading font-semibold text-slate-900", compact ? "text-2xl" : "text-3xl")}>
          {value}
        </span>
        {unit ? <span className="text-sm text-slate-500">{unit}</span> : null}
      </div>
      <div className="mt-1 flex items-end justify-between gap-3">
        <div>
          {delta ? (
            <div
              className={cn(
                "text-xs font-medium",
                delta.positive ? "text-emerald-600" : "text-red-600",
              )}
            >
              {delta.positive ? "▲" : "▼"} {delta.value}
            </div>
          ) : null}
          {hint ? <div className="mt-0.5 text-[11px] text-slate-500">{hint}</div> : null}
        </div>
        {spark && spark.length > 1 ? (
          <Sparkline data={spark} stroke={SPARK[tone].stroke} fill={SPARK[tone].fill} />
        ) : null}
      </div>
    </div>
  );
}
