import { cn } from "@/lib/cn";
import type { ReactNode } from "react";

type Props = {
  label: string;
  value: ReactNode;
  unit?: string;
  delta?: { value: string; positive?: boolean };
  tone?: "primary" | "info" | "warning" | "danger" | "violet" | "neutral";
  icon?: ReactNode;
};

const TONES: Record<NonNullable<Props["tone"]>, string> = {
  primary: "from-emerald-50 to-white border-emerald-100",
  info: "from-sky-50 to-white border-sky-100",
  warning: "from-amber-50 to-white border-amber-100",
  danger: "from-red-50 to-white border-red-100",
  violet: "from-violet-50 to-white border-violet-100",
  neutral: "from-slate-50 to-white border-slate-100",
};

const ICON_BG: Record<NonNullable<Props["tone"]>, string> = {
  primary: "bg-emerald-100 text-emerald-700",
  info: "bg-sky-100 text-sky-700",
  warning: "bg-amber-100 text-amber-700",
  danger: "bg-red-100 text-red-700",
  violet: "bg-violet-100 text-violet-700",
  neutral: "bg-slate-100 text-slate-700",
};

export function KpiCard({ label, value, unit, delta, tone = "neutral", icon }: Props) {
  return (
    <div
      className={cn(
        "rounded-2xl border bg-gradient-to-b p-5 shadow-sm transition hover:shadow",
        TONES[tone],
      )}
    >
      <div className="flex items-start justify-between">
        <span className="text-xs font-medium uppercase tracking-wider text-slate-500">
          {label}
        </span>
        {icon ? (
          <span className={cn("rounded-lg p-1.5", ICON_BG[tone])}>{icon}</span>
        ) : null}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="font-heading text-3xl font-semibold text-slate-900">{value}</span>
        {unit ? <span className="text-sm text-slate-500">{unit}</span> : null}
      </div>
      {delta ? (
        <div
          className={cn(
            "mt-1 text-xs font-medium",
            delta.positive ? "text-emerald-600" : "text-red-600",
          )}
        >
          {delta.positive ? "▲" : "▼"} {delta.value}
        </div>
      ) : null}
    </div>
  );
}
