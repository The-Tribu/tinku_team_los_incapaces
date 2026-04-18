"use client";

import { useState } from "react";
import { cn } from "@/lib/cn";

export type WeeklyPoint = {
  label: string; // Lun, Mar… (Dom si es hoy)
  kwh: number;
  isToday: boolean;
};

/**
 * Visualización simple de barras de 7 días siguiendo el mockup:
 * cada barra es `bg-primary/20` salvo la de hoy que es `bg-primary` con tooltip.
 * Es interactiva: tap/hover muestra el valor de kWh en un popover flotante.
 */
export function WeeklyBars({ data }: { data: WeeklyPoint[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.kwh));

  return (
    <div className="flex h-32 items-end justify-between gap-2">
      {data.map((d, i) => {
        const heightPct = Math.max(6, Math.round((d.kwh / max) * 100));
        const showTip = active === i || d.isToday;
        return (
          <button
            key={`${d.label}-${i}`}
            type="button"
            onClick={() => setActive((v) => (v === i ? null : i))}
            onMouseEnter={() => setActive(i)}
            onMouseLeave={() => setActive(null)}
            className="group relative flex h-full flex-1 cursor-pointer flex-col items-center gap-1.5"
          >
            <div className="flex w-full flex-1 items-end">
              <div
                className={cn(
                  "relative w-full rounded-t-lg transition-all duration-200",
                  d.isToday
                    ? "bg-m3-primary"
                    : "bg-m3-primary/20 group-hover:bg-m3-primary/40",
                )}
                style={{ height: `${heightPct}%` }}
              >
                {showTip ? (
                  <span
                    className={cn(
                      "absolute left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9px] font-bold shadow-sm",
                      d.isToday
                        ? "-top-7 bg-m3-on-surface text-white"
                        : "-top-6 bg-white text-m3-on-surface ring-1 ring-m3-outline-variant/40",
                    )}
                  >
                    {d.isToday ? "Hoy · " : ""}
                    {Math.round(d.kwh).toLocaleString("es-CO")} kWh
                  </span>
                ) : null}
              </div>
            </div>
            <span
              className={cn(
                "text-[10px]",
                d.isToday
                  ? "font-bold text-m3-primary"
                  : "font-medium text-m3-outline",
              )}
            >
              {d.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
