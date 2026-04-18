import { cn } from "@/lib/cn";

const STYLES: Record<string, string> = {
  growatt: "bg-emerald-50 text-emerald-800 ring-emerald-200",
  huawei: "bg-fuchsia-50 text-fuchsia-800 ring-fuchsia-200",
  deye: "bg-sky-50 text-sky-800 ring-sky-200",
  hoymiles: "bg-amber-50 text-amber-800 ring-amber-200",
  srne: "bg-violet-50 text-violet-800 ring-violet-200",
  solarman: "bg-indigo-50 text-indigo-800 ring-indigo-200",
};

const LABELS: Record<string, string> = {
  growatt: "Growatt",
  huawei: "Huawei",
  deye: "Deye",
  hoymiles: "Hoymiles",
  srne: "SRNE",
  solarman: "Solarman",
};

export function BrandChip({
  slug,
  size = "md",
  className,
}: {
  slug: string;
  size?: "sm" | "md";
  className?: string;
}) {
  const key = slug.toLowerCase();
  const tone = STYLES[key] ?? "bg-slate-50 text-slate-700 ring-slate-200";
  const label = LABELS[key] ?? slug;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full font-medium ring-1",
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-2.5 py-0.5 text-xs",
        tone,
        className,
      )}
    >
      <span
        className={cn("rounded-full", {
          "bg-emerald-500": key === "growatt",
          "bg-fuchsia-500": key === "huawei",
          "bg-sky-500": key === "deye",
          "bg-amber-500": key === "hoymiles",
          "bg-violet-500": key === "srne",
          "bg-indigo-500": key === "solarman",
          "bg-slate-400": !STYLES[key],
          "h-1.5 w-1.5": size === "sm",
          "h-2 w-2": size === "md",
        })}
      />
      {label}
    </span>
  );
}
