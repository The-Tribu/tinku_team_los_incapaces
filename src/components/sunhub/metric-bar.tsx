import { cn } from "@/lib/cn";

type Tone = "primary" | "warning" | "danger" | "info" | "neutral";

const FILL: Record<Tone, string> = {
  primary: "bg-emerald-500",
  warning: "bg-amber-500",
  danger: "bg-red-500",
  info: "bg-sky-500",
  neutral: "bg-slate-400",
};

export function MetricBar({
  value,
  max = 100,
  tone = "primary",
  className,
  trackClassName,
  label,
}: {
  value: number;
  max?: number;
  tone?: Tone;
  className?: string;
  trackClassName?: string;
  label?: string;
}) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className={cn("w-full", className)}>
      <div className={cn("h-1.5 w-full overflow-hidden rounded-full bg-slate-100", trackClassName)}>
        <div className={cn("h-full rounded-full transition-all", FILL[tone])} style={{ width: `${pct}%` }} />
      </div>
      {label ? <p className="mt-1 text-[11px] text-slate-500">{label}</p> : null}
    </div>
  );
}
