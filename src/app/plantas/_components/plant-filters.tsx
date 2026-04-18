"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Check, Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";

export type PlantFiltersProps = {
  brands: string[];
  activeBrands: string[];
  statuses: { slug: string; label: string }[];
  activeStatus: string | null;
  sorts: { slug: string; label: string }[];
  activeSort: string;
  search: string;
};

/**
 * Barra de filtros para el listado de plantas. Mantiene el estado en la URL
 * (searchParams) para que el SSR siga siendo la fuente de verdad, pero expone
 * controles interactivos (chips multi, sort, buscador) como client component.
 */
export function PlantFilters({
  brands,
  activeBrands,
  statuses,
  activeStatus,
  sorts,
  activeSort,
  search,
}: PlantFiltersProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [searchDraft, setSearchDraft] = useState(search);

  const activeBrandSet = useMemo(() => new Set(activeBrands), [activeBrands]);
  const hasAnyFilter = Boolean(
    activeStatus || activeBrands.length > 0 || search || activeSort !== "code_asc",
  );

  function pushParams(next: URLSearchParams) {
    const qs = next.toString();
    startTransition(() => {
      router.push(`/plantas${qs ? `?${qs}` : ""}`);
    });
  }

  function toggleBrand(slug: string) {
    const params = new URLSearchParams(sp.toString());
    const current = new Set(activeBrands);
    if (current.has(slug)) current.delete(slug);
    else current.add(slug);
    if (current.size === 0) params.delete("brand");
    else params.set("brand", Array.from(current).join(","));
    pushParams(params);
  }

  function setStatus(slug: string | null) {
    const params = new URLSearchParams(sp.toString());
    if (slug) params.set("status", slug);
    else params.delete("status");
    pushParams(params);
  }

  function setSort(slug: string) {
    const params = new URLSearchParams(sp.toString());
    if (slug === "code_asc") params.delete("sort");
    else params.set("sort", slug);
    pushParams(params);
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams(sp.toString());
    if (searchDraft.trim()) params.set("q", searchDraft.trim());
    else params.delete("q");
    pushParams(params);
  }

  function clearAll() {
    setSearchDraft("");
    startTransition(() => {
      router.push("/plantas");
    });
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-slate-200/70 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]",
        isPending && "opacity-80",
      )}
    >
      <div className="flex flex-wrap items-center gap-2">
        <form
          onSubmit={submitSearch}
          className="relative flex flex-1 min-w-[240px] items-center"
        >
          <Search className="pointer-events-none absolute left-3 h-4 w-4 text-slate-400" />
          <input
            value={searchDraft}
            onChange={(e) => setSearchDraft(e.target.value)}
            placeholder="Buscar por nombre, codigo o cliente..."
            className="h-9 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-700 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          {searchDraft ? (
            <button
              type="button"
              onClick={() => {
                setSearchDraft("");
                const params = new URLSearchParams(sp.toString());
                params.delete("q");
                pushParams(params);
              }}
              className="absolute right-2 rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Limpiar busqueda"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </form>

        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-slate-50 px-1 py-1 text-xs">
          <SlidersHorizontal className="ml-1 h-3.5 w-3.5 text-slate-400" />
          <span className="pl-1 pr-2 text-slate-500">Ordenar</span>
          <select
            value={activeSort}
            onChange={(e) => setSort(e.target.value)}
            className="rounded-md bg-white px-2 py-1 text-xs text-slate-700 ring-1 ring-slate-200 focus:outline-none focus:ring-emerald-300"
          >
            {sorts.map((s) => (
              <option key={s.slug} value={s.slug}>
                {s.label}
              </option>
            ))}
          </select>
        </div>

        {hasAnyFilter ? (
          <button
            type="button"
            onClick={clearAll}
            className="ml-1 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50"
          >
            <X className="h-3 w-3" />
            Limpiar filtros
          </button>
        ) : null}
      </div>

      <div className="mt-3 space-y-2 border-t border-slate-100 pt-3">
        {/* Marca — chips neutros con punto de color identificador. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Marca
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            {brands.map((b) => {
              const active = activeBrandSet.has(b);
              const label = BRAND_LABELS[b.toLowerCase()] ?? b;
              return (
                <button
                  key={b}
                  type="button"
                  onClick={() => toggleBrand(b)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    active
                      ? "border-slate-900 bg-slate-900 text-white shadow-sm"
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      BRAND_DOT[b.toLowerCase()] ?? "bg-slate-400",
                    )}
                  />
                  {label}
                  {active ? <Check className="h-3 w-3" /> : null}
                </button>
              );
            })}
          </div>
        </div>

        {/* Estado — semántica de color sólo al seleccionar. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <span className="w-14 shrink-0 text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Estado
          </span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setStatus(null)}
              aria-pressed={!activeStatus}
              className={cn(
                "rounded-full px-2.5 py-1 text-xs font-medium transition",
                !activeStatus
                  ? "bg-slate-900 text-white shadow-sm"
                  : "border border-slate-200 bg-white text-slate-600 hover:bg-slate-50",
              )}
            >
              Todos
            </button>
            {statuses.map((s) => {
              const active = activeStatus === s.slug;
              const sel = STATUS_SELECTED[s.slug] ?? "bg-slate-900 text-white";
              const dot = STATUS_DOT[s.slug] ?? "bg-slate-400";
              return (
                <button
                  key={s.slug}
                  type="button"
                  onClick={() => setStatus(s.slug)}
                  aria-pressed={active}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition",
                    active
                      ? cn(sel, "border-transparent shadow-sm")
                      : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50",
                  )}
                >
                  <span
                    className={cn(
                      "inline-block h-1.5 w-1.5 rounded-full",
                      active ? "bg-white/80" : dot,
                    )}
                  />
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

// Paletas controladas fuera del JSX para mantener el componente legible.
// `dot` = identificador permanente (pequeño), `selected` = fill al activar.
const BRAND_LABELS: Record<string, string> = {
  growatt: "Growatt",
  huawei: "Huawei",
  deye: "Deye",
  hoymiles: "Hoymiles",
  srne: "SRNE",
  solarman: "Solarman",
};

const BRAND_DOT: Record<string, string> = {
  growatt: "bg-emerald-500",
  huawei: "bg-fuchsia-500",
  deye: "bg-sky-500",
  hoymiles: "bg-amber-500",
  srne: "bg-violet-500",
  solarman: "bg-indigo-500",
};

const STATUS_DOT: Record<string, string> = {
  online: "bg-emerald-500",
  warning: "bg-amber-500",
  degraded: "bg-orange-500",
  offline: "bg-rose-500",
};

const STATUS_SELECTED: Record<string, string> = {
  online: "bg-emerald-600 text-white",
  warning: "bg-amber-600 text-white",
  degraded: "bg-orange-600 text-white",
  offline: "bg-rose-600 text-white",
};
