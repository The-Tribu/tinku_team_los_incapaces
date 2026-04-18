import Link from "next/link";
import { AppShell } from "@/components/sunhub/app-shell";
import { StatusBadge } from "@/components/sunhub/status-badge";
import { listPlants } from "@/lib/fleet";

export const dynamic = "force-dynamic";

const STATUSES = ["online", "warning", "degraded", "offline"];
const PROVIDERS = ["growatt", "deye"];

type SearchParams = {
  status?: string;
  provider?: string;
  region?: string;
  q?: string;
};

export default async function PlantsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const sp = await searchParams;
  const { rows, total } = await listPlants({
    status: sp.status,
    provider: sp.provider,
    region: sp.region,
    search: sp.q,
    limit: 100,
  });

  const currentPath = (k: keyof SearchParams, v?: string) => {
    const params = new URLSearchParams();
    for (const [key, val] of Object.entries(sp)) {
      if (val && key !== k) params.set(key, val);
    }
    if (v) params.set(k, v);
    const qs = params.toString();
    return `/plantas${qs ? `?${qs}` : ""}`;
  };

  return (
    <AppShell
      title="Plantas"
      subtitle={`${total} instalaciones · ${rows.length} mostrando`}
    >
      <section className="mb-4 flex flex-wrap items-center gap-3">
        <form action="/plantas" className="flex items-center gap-2">
          {sp.status ? <input type="hidden" name="status" value={sp.status} /> : null}
          {sp.provider ? <input type="hidden" name="provider" value={sp.provider} /> : null}
          <input
            type="text"
            name="q"
            defaultValue={sp.q}
            placeholder="Buscar planta o código…"
            className="w-72 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-100"
          />
          <button
            type="submit"
            className="rounded-lg bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800"
          >
            Buscar
          </button>
        </form>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500">Estado:</span>
          <Link
            href={currentPath("status")}
            className={`rounded-md px-2 py-1 ${!sp.status ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Todas
          </Link>
          {STATUSES.map((s) => (
            <Link
              key={s}
              href={currentPath("status", s)}
              className={`rounded-md px-2 py-1 capitalize ${
                sp.status === s ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {s}
            </Link>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-500">Proveedor:</span>
          <Link
            href={currentPath("provider")}
            className={`rounded-md px-2 py-1 ${!sp.provider ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
          >
            Todos
          </Link>
          {PROVIDERS.map((p) => (
            <Link
              key={p}
              href={currentPath("provider", p)}
              className={`rounded-md px-2 py-1 capitalize ${
                sp.provider === p ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p}
            </Link>
          ))}
        </div>
      </section>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3 font-medium">Código</th>
              <th className="px-4 py-3 font-medium">Planta</th>
              <th className="px-4 py-3 font-medium">Cliente</th>
              <th className="px-4 py-3 font-medium">Región</th>
              <th className="px-4 py-3 font-medium">Proveedor</th>
              <th className="px-4 py-3 font-medium text-right">Capacidad</th>
              <th className="px-4 py-3 font-medium text-right">Potencia</th>
              <th className="px-4 py-3 font-medium">Estado</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-sm text-slate-500">
                  Sin plantas que coincidan con el filtro.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="border-t border-slate-100 hover:bg-slate-50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{p.code}</td>
                  <td className="px-4 py-3">
                    <Link
                      href={`/plantas/${p.id}`}
                      className="font-medium text-slate-900 hover:text-emerald-700"
                    >
                      {p.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{p.client}</td>
                  <td className="px-4 py-3 text-slate-500">{p.region ?? "—"}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-medium capitalize text-slate-700">
                      {p.provider}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.capacityKwp.toLocaleString("es-CO")} kWp
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">
                    {p.currentPowerKw.toFixed(1)} kW
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={p.status} />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AppShell>
  );
}
