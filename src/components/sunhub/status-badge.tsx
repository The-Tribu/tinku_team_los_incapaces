import { cn } from "@/lib/cn";

const STYLES: Record<string, string> = {
  online: "bg-emerald-100 text-emerald-700 border-emerald-200",
  warning: "bg-amber-100 text-amber-700 border-amber-200",
  degraded: "bg-orange-100 text-orange-700 border-orange-200",
  offline: "bg-red-100 text-red-700 border-red-200",
  unknown: "bg-slate-100 text-slate-600 border-slate-200",
};

const LABELS: Record<string, string> = {
  online: "Activa",
  warning: "Aviso",
  degraded: "Degradada",
  offline: "Offline",
  unknown: "Sin datos",
};

export function StatusBadge({ status, className }: { status: string; className?: string }) {
  const s = STYLES[status] ?? STYLES.unknown;
  const label = LABELS[status] ?? status;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-medium",
        s,
        className,
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", {
        "bg-emerald-500": status === "online",
        "bg-amber-500": status === "warning",
        "bg-orange-500": status === "degraded",
        "bg-red-500": status === "offline",
        "bg-slate-400": status === "unknown",
      })} />
      {label}
    </span>
  );
}
