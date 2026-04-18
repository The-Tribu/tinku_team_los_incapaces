"use client";
import Link from "next/link";
import { useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { FleetMap } from "./fleet-map";
import { StatusBadge } from "./status-badge";

export type TopPlant = {
  id: string;
  name: string;
  code: string;
  client: string;
  capacityKwp: number;
  pr: number;
  status: string;
};

export function FleetOverview({ topPlants }: { topPlants: TopPlant[] }) {
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return topPlants;
    return topPlants.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.client.toLowerCase().includes(q) ||
        p.status.toLowerCase().includes(q),
    );
  }, [topPlants, query]);

  return (
    <section className="mt-6 grid gap-5 lg:grid-cols-5">
      <div className="lg:col-span-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-heading text-base font-semibold">Mapa de la flota</h2>
            <p className="text-xs text-slate-500">
              Color indica estado · tamaño proporcional a capacidad · scroll para zoom
            </p>
          </div>
          {focusedId ? (
            <button
              onClick={() => setFocusedId(null)}
              className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"
            >
              Reset vista
            </button>
          ) : null}
        </div>
        <div className="mt-3">
          <FleetMap focusedId={focusedId} />
        </div>
      </div>

      <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-heading text-base font-semibold">Top plantas</h2>
          <Link href="/plantas" className="text-xs font-medium text-emerald-700 hover:underline">
            Ver todas →
          </Link>
        </div>

        <div className="relative mb-3">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar planta, cliente o código…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          {query ? (
            <button
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 hover:text-slate-600"
              aria-label="Limpiar búsqueda"
            >
              <X className="h-4 w-4" />
            </button>
          ) : null}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 py-8 text-center text-xs text-slate-500">
            Sin resultados para <span className="font-medium">"{query}"</span>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase text-slate-500">
                <th className="pb-2 font-medium">Planta</th>
                <th className="pb-2 font-medium">PR</th>
                <th className="pb-2 font-medium text-right">Estado</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => {
                const isActive = p.id === focusedId;
                return (
                  <tr
                    key={p.id}
                    onClick={() => setFocusedId(p.id)}
                    className={`cursor-pointer border-t border-slate-100 transition ${
                      isActive ? "bg-emerald-50" : "hover:bg-slate-50"
                    }`}
                  >
                    <td className="py-2.5">
                      <div className="flex items-center gap-2">
                        {isActive ? <span className="text-xs text-emerald-700">●</span> : null}
                        <div>
                          <div className="font-medium text-slate-900">{p.name}</div>
                          <div className="text-xs text-slate-500">
                            {p.client} · {p.capacityKwp} kWp
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 tabular-nums text-slate-700">
                      {p.pr.toFixed(1)}%
                    </td>
                    <td className="py-2.5 text-right">
                      <StatusBadge status={p.status} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <p className="mt-3 text-[11px] text-slate-400">
          {filtered.length} de {topPlants.length} plantas
        </p>
      </div>
    </section>
  );
}
