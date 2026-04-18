"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { cn } from "@/lib/cn";
import { BrandChip } from "@/components/sunhub/brand-chip";

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

      <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Marca
          </span>
          {brands.map((b) => {
            const active = activeBrandSet.has(b);
            return (
              <button
                key={b}
                type="button"
                onClick={() => toggleBrand(b)}
                className={cn(
                  "rounded-full transition",
                  active
                    ? "ring-2 ring-emerald-400 ring-offset-1"
                    : "opacity-70 hover:opacity-100",
                )}
                aria-pressed={active}
              >
                <BrandChip slug={b} size="sm" />
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
            Estado
          </span>
          <button
            type="button"
            onClick={() => setStatus(null)}
            className={cn(
              "rounded-full px-2.5 py-0.5 text-xs font-medium transition",
              !activeStatus
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200",
            )}
          >
            Todos
          </button>
          {statuses.map((s) => {
            const active = activeStatus === s.slug;
            const colors: Record<string, string> = {
              online: active
                ? "bg-emerald-600 text-white"
                : "bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
              warning: active
                ? "bg-amber-600 text-white"
                : "bg-amber-50 text-amber-700 hover:bg-amber-100",
              degraded: active
                ? "bg-orange-600 text-white"
                : "bg-orange-50 text-orange-700 hover:bg-orange-100",
              offline: active
                ? "bg-red-600 text-white"
                : "bg-red-50 text-red-700 hover:bg-red-100",
            };
            return (
              <button
                key={s.slug}
                type="button"
                onClick={() => setStatus(s.slug)}
                className={cn(
                  "rounded-full px-2.5 py-0.5 text-xs font-medium transition",
                  colors[s.slug] ?? "bg-slate-100 text-slate-700",
                )}
              >
                {s.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
