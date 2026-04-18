import { prisma } from "@/lib/prisma";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function ClientePage() {
  const clients = await prisma.client.findMany({
    orderBy: { name: "asc" },
    include: {
      plants: {
        include: {
          devices: { select: { currentStatus: true } },
        },
      },
    },
  });
  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50">
      <div className="mx-auto max-w-md px-5 py-8">
        <div className="flex items-center gap-2">
          <span className="font-heading text-2xl font-bold text-emerald-600">SunHub</span>
          <span className="text-sm text-slate-500">para clientes</span>
        </div>
        <h1 className="mt-6 font-heading text-2xl font-bold text-slate-900">
          Tu energía solar, en vivo
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Selecciona tu empresa para ver el estado de tu planta, tus ahorros y tu impacto ambiental.
        </p>
        <div className="mt-6 space-y-3">
          {clients.map((c) => {
            const totalKwp = c.plants.reduce((s, p) => s + Number(p.capacityKwp ?? 0), 0);
            return (
              <Link
                key={c.id}
                href={`/cliente/${c.id}`}
                className="block rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-heading text-base font-semibold">{c.name}</div>
                    <div className="text-xs text-slate-500">
                      {c.plants.length} {c.plants.length === 1 ? "planta" : "plantas"} · {totalKwp.toFixed(0)} kWp
                    </div>
                  </div>
                  <span className="text-lg text-emerald-600">→</span>
                </div>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
