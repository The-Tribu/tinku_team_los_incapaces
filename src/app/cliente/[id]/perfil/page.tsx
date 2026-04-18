import { notFound } from "next/navigation";
import Link from "next/link";
import {
  Bell,
  Building2,
  ChevronRight,
  LogOut,
  Mail,
  MapPin,
  Shield,
} from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";
import { TopBar } from "../top-bar";

export const dynamic = "force-dynamic";

export default async function PerfilPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [user, plant] = await Promise.all([
    getSessionUser(),
    prisma.plant.findUnique({
      where: { id },
      include: { client: { select: { name: true, region: true } } },
    }),
  ]);
  if (!plant) notFound();

  const totalKwp = Number(plant.capacityKwp ?? 0);
  const location = plant.location ?? plant.client.region ?? plant.client.name;

  const rows: Array<{
    icon: typeof Mail;
    label: string;
    value: string;
    href?: string;
  }> = [
    {
      icon: Building2,
      label: "Planta",
      value: `${plant.name} · ${totalKwp.toFixed(0)} kWp`,
    },
    {
      icon: MapPin,
      label: "Ubicación",
      value: location,
    },
    {
      icon: Mail,
      label: "Correo",
      value: user?.email ?? "—",
    },
    {
      icon: Shield,
      label: "Rol",
      value: user?.role ?? "cliente",
    },
    {
      icon: Bell,
      label: "Notificaciones",
      value: "Activas",
      href: "/configuracion",
    },
  ];

  return (
    <>
      <TopBar
        plantId={id}
        plantName={plant.name}
        greetingName={plant.name}
        title="Perfil"
        subtitle={user?.email ?? "Tu cuenta"}
        showBack
      />
      <main className="mx-auto mt-2 w-full max-w-lg space-y-4 px-5">
        <section className="flex flex-col items-center rounded-[2rem] bg-gradient-to-br from-m3-primary to-m3-primary-container p-6 text-white">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-white/20 text-2xl font-bold">
            {(user?.name ?? plant.name).charAt(0).toUpperCase()}
          </div>
          <p className="mt-3 font-heading text-lg font-bold">
            {user?.name ?? plant.name}
          </p>
          <p className="text-xs text-white/80">
            {user?.email ?? "Portal cliente SunHub"}
          </p>
        </section>

        <ul className="divide-y divide-m3-outline-variant/20 overflow-hidden rounded-[2rem] bg-m3-surface-container-lowest shadow-sm">
          {rows.map((r) => {
            const Icon = r.icon;
            const inner = (
              <div className="flex items-center gap-3 px-5 py-4">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-m3-surface-container-low text-m3-primary">
                  <Icon className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-m3-outline">
                    {r.label}
                  </p>
                  <p className="truncate text-sm font-semibold text-m3-on-surface">
                    {r.value}
                  </p>
                </div>
                {r.href ? (
                  <ChevronRight className="h-4 w-4 text-m3-outline" />
                ) : null}
              </div>
            );
            return (
              <li key={r.label}>
                {r.href ? (
                  <Link
                    href={r.href}
                    className="block transition active:bg-m3-surface-container-low"
                  >
                    {inner}
                  </Link>
                ) : (
                  inner
                )}
              </li>
            );
          })}
        </ul>

        <Link
          href="/cliente"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-m3-surface-container-lowest px-4 py-3 text-sm font-bold text-m3-primary shadow-sm transition active:scale-[0.99]"
        >
          Cambiar planta
        </Link>

        <form action="/api/auth/logout" method="POST">
          <button
            type="submit"
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-m3-surface-container-lowest px-4 py-3 text-sm font-bold text-m3-error shadow-sm transition active:scale-[0.99]"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </form>

        <p className="pt-1 text-center text-[10px] text-m3-outline">
          SunHub · v1.0 · Techos Rentables
        </p>
      </main>
    </>
  );
}
