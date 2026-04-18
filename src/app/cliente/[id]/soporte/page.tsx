import { notFound } from "next/navigation";
import { Headphones, MessageSquare, Phone, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TopBar } from "../top-bar";

export const dynamic = "force-dynamic";

export default async function SoportePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plant = await prisma.plant.findUnique({
    where: { id },
    select: { id: true, name: true },
  });
  if (!plant) notFound();

  const options: Array<{
    id: string;
    label: string;
    sub: string;
    icon: typeof Headphones;
    accent?: boolean;
  }> = [
    {
      id: "chat",
      label: "Chat con un técnico",
      sub: "Respuesta en menos de 10 min",
      icon: MessageSquare,
      accent: true,
    },
    {
      id: "call",
      label: "Llamar a soporte",
      sub: "Lun–Vie · 7am–6pm",
      icon: Phone,
    },
    {
      id: "sla",
      label: "Ver estado del SLA",
      sub: "Garantía de uptime y respuesta",
      icon: ShieldCheck,
    },
  ];

  return (
    <>
      <TopBar
        plantId={id}
        plantName={plant.name}
        greetingName={plant.name}
        title="Soporte"
        subtitle={`${plant.name} · estamos para ayudarte`}
        showBack
      />
      <main className="mx-auto mt-2 w-full max-w-lg space-y-4 px-5">
        <section className="rounded-[2rem] bg-m3-secondary-container p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/40">
              <Headphones className="h-6 w-6 text-m3-on-secondary-container" />
            </div>
            <p className="text-sm font-bold leading-tight text-m3-on-secondary-container">
              Tu equipo de SunHub está disponible para resolver cualquier duda.
            </p>
          </div>
        </section>

        <ul className="space-y-3">
          {options.map((o) => {
            const Icon = o.icon;
            return (
              <li
                key={o.id}
                className="flex items-center gap-3 rounded-2xl bg-m3-surface-container-lowest p-4 shadow-sm transition active:scale-[0.99]"
              >
                <span
                  className={
                    o.accent
                      ? "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-m3-primary text-white"
                      : "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-m3-surface-container-low text-m3-primary"
                  }
                >
                  <Icon className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-heading text-sm font-bold text-m3-on-surface">
                    {o.label}
                  </p>
                  <p className="truncate text-[11px] text-m3-outline">
                    {o.sub}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>

        <p className="text-center text-[11px] italic text-m3-outline">
          Próximamente: bitácora de tickets y seguimiento en tiempo real.
        </p>
      </main>
    </>
  );
}
