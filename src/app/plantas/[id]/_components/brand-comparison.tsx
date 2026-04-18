import { BrandChip } from "@/components/sunhub/brand-chip";
import { cn } from "@/lib/cn";

export type BrandBar = {
  slug: string;
  devices: number;
  powerKw: number;
  onlinePct: number;
};

const TONE: Record<string, string> = {
  growatt: "bg-emerald-500",
  huawei: "bg-rose-500",
  deye: "bg-sky-500",
  hoymiles: "bg-amber-500",
  srne: "bg-violet-500",
  solarman: "bg-indigo-500",
};

/**
 * Comparativa entre marcas dentro de UNA planta (multi-proveedor). Muestra
 * potencia activa y % online. Sin librerias de charts: barras simples hechas
 * con tailwind para que el bloque renderice rapido en SSR.
 */
export function BrandComparison({ bars }: { bars: BrandBar[] }) {
  if (bars.length === 0) {
    return (
      <p className="py-6 text-center text-xs text-slate-500">
        Solo hay una marca instalada en esta planta.
      </p>
    );
  }
  const max = Math.max(...bars.map((b) => b.powerKw), 0.1);
  return (
    <ul className="space-y-3">
      {bars.map((b) => {
        const pct = (b.powerKw / max) * 100;
        return (
          <li key={b.slug} className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <BrandChip slug={b.slug} size="sm" />
                <span className="text-[11px] text-slate-500">
                  {b.devices} dispositivo{b.devices === 1 ? "" : "s"}
                </span>
              </div>
              <span className="tabular-nums text-xs font-medium text-slate-700">
                {b.powerKw.toFixed(1)} kW
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={cn("h-full rounded-full", TONE[b.slug] ?? "bg-slate-400")}
                style={{ width: `${pct}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-[11px] text-slate-500">
              <span>Online: {b.onlinePct.toFixed(0)}%</span>
              <span>
                {pct.toFixed(0)}% del total en planta
              </span>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
