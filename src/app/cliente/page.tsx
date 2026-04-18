import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, MapPin, Sun } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

/**
 * Landing del portal cliente — PWA.
 *
 * Techos Rentables opera todas las plantas, así que el usuario aquí selecciona
 * una planta directamente (no una empresa). Si hay una sola planta, saltamos
 * el picker y vamos directo al dashboard.
 */
export default async function ClientePage() {
  const [user, plants] = await Promise.all([
    getSessionUser(),
    prisma.plant.findMany({
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
      include: {
        client: { select: { id: true, name: true, region: true } },
        devices: { select: { currentStatus: true } },
      },
    }),
  ]);

  // Visitante con una única planta → saltamos el picker.
  if (plants.length === 1) {
    redirect(`/cliente/${plants[0].id}`);
  }

  const subtitle = user?.name
    ? `Hola, ${user.name.split(/\s+/)[0]} — elige la planta que quieres ver.`
    : "Selecciona la planta que quieres consultar.";

  return (
    <div className="min-h-screen bg-m3-surface font-sans text-m3-on-surface">
      <div className="mx-auto flex min-h-screen w-full max-w-lg flex-col px-5 py-6 md:py-10">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-m3-primary to-m3-primary-container text-white">
            <Sun className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h1 className="font-heading text-xl font-bold tracking-tight text-m3-primary">
              SunHub
            </h1>
            <p className="text-[11px] font-medium text-m3-outline">
              Techos Rentables · {plants.length}{" "}
              {plants.length === 1 ? "planta" : "plantas"}
            </p>
          </div>
        </div>

        <h2 className="mt-6 font-heading text-3xl font-extrabold tracking-tight text-m3-on-surface">
          Tu energía solar, en vivo
        </h2>
        <p className="mt-1 text-sm text-m3-outline">{subtitle}</p>

        <div className="mt-6 space-y-3">
          {plants.length === 0 ? (
            <div className="rounded-[2rem] bg-m3-surface-container-low p-8 text-center text-sm text-m3-outline">
              Aún no hay plantas registradas.
            </div>
          ) : null}
          {plants.map((p) => {
            const online = p.devices.filter(
              (d) => d.currentStatus === "online",
            ).length;
            const kwp = Number(p.capacityKwp ?? 0);
            const location = p.location ?? p.client.region ?? p.client.name;
            return (
              <Link
                key={p.id}
                href={`/cliente/${p.id}`}
                className="group flex items-center justify-between gap-3 rounded-[2rem] bg-m3-surface-container-lowest p-5 shadow-sm transition active:scale-[0.99]"
              >
                <div className="min-w-0">
                  <p className="truncate font-heading text-base font-bold text-m3-on-surface">
                    {p.name}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-m3-outline">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{location}</span>
                    <span className="mx-1 text-m3-outline-variant">·</span>
                    <span>{kwp.toFixed(0)} kWp</span>
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-m3-surface-container-low px-2.5 py-0.5 text-[10px] font-bold text-m3-primary">
                      🟢 {online}/{p.devices.length} online
                    </span>
                    <span className="rounded-full px-1 text-[10px] font-mono text-m3-outline">
                      {p.code}
                    </span>
                  </div>
                </div>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-m3-surface-container-low text-m3-primary transition group-hover:bg-m3-primary group-hover:text-white">
                  <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}
