import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Sun } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Landing del portal cliente.
 *
 * No existe aún una relación User↔Client en el schema, así que mantenemos el
 * fallback heredado: se listan los clientes y el visitante elige. Si el
 * usuario con sesión es "viewer" y sólo hay un cliente, redirigimos directo a
 * su dashboard (UX móvil: el cliente no necesita un picker).
 */
export default async function ClientePage() {
  const [user, clients] = await Promise.all([
    getSessionUser(),
    prisma.client.findMany({
      orderBy: { name: "asc" },
      include: {
        plants: {
          include: {
            devices: { select: { currentStatus: true } },
          },
        },
      },
    }),
  ]);

  // Viewer con un único cliente → saltamos el picker.
  if (user?.role === "viewer" && clients.length === 1) {
    redirect(`/cliente/${clients[0].id}`);
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-emerald-50 via-white to-sky-50">
      <div className="mx-auto max-w-md px-5 py-8 md:max-w-xl">
        <div className="flex items-center gap-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
            <Sun className="h-5 w-5" />
          </span>
          <span className="font-heading text-2xl font-bold text-emerald-600">
            SunHub
          </span>
          <span className="text-sm text-slate-500">para clientes</span>
        </div>
        <h1 className="mt-6 font-heading text-2xl font-bold text-slate-900">
          Tu energía solar, en vivo
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Selecciona tu empresa para ver el estado de tu planta, tus ahorros y
          tu impacto ambiental.
        </p>
        <div className="mt-6 space-y-3">
          {clients.map((c) => {
            const totalKwp = c.plants.reduce(
              (s, p) => s + Number(p.capacityKwp ?? 0),
              0,
            );
            const devices = c.plants.flatMap((p) => p.devices);
            const online = devices.filter(
              (d) => d.currentStatus === "online",
            ).length;
            return (
              <Link
                key={c.id}
                href={`/cliente/${c.id}`}
                className="group flex items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-emerald-300 hover:shadow-md"
              >
                <div className="min-w-0">
                  <div className="font-heading text-base font-semibold text-slate-900">
                    {c.name}
                  </div>
                  <div className="text-xs text-slate-500">
                    {c.plants.length}{" "}
                    {c.plants.length === 1 ? "planta" : "plantas"} ·{" "}
                    {totalKwp.toFixed(0)} kWp · {online}/{devices.length} online
                  </div>
                </div>
                <span className="text-emerald-600 transition group-hover:translate-x-0.5">
                  <ChevronRight className="h-5 w-5" />
                </span>
              </Link>
            );
          })}
          {clients.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-6 text-center text-sm text-slate-500">
              Aún no hay clientes registrados.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
