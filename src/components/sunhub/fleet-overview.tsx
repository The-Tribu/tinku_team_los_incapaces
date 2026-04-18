"use client";
import Link from "next/link";
import { useState } from "react";
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
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-heading text-base font-semibold">Top plantas</h2>
          <Link href="/plantas" className="text-xs font-medium text-emerald-700 hover:underline">
            Ver todas →
          </Link>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase text-slate-500">
              <th className="pb-2 font-medium">Planta</th>
              <th className="pb-2 font-medium">PR</th>
              <th className="pb-2 font-medium text-right">Estado</th>
            </tr>
          </thead>
          <tbody>
            {topPlants.map((p) => {
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
      </div>
    </section>
  );
}
