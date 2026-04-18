import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowRight, Bolt } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TopBar } from "../top-bar";

export const dynamic = "force-dynamic";

function statusPill(status: string) {
  const s = status.toLowerCase();
  if (s === "online") return { label: "🟢 Online", tone: "ok" as const };
  if (s === "warning" || s === "degraded")
    return { label: "🟡 Warning", tone: "warn" as const };
  if (s === "offline") return { label: "🔴 Offline", tone: "bad" as const };
  return { label: "⚪ " + status, tone: "soft" as const };
}

export default async function EnergiaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plant = await prisma.plant.findUnique({
    where: { id },
    include: {
      client: { select: { name: true } },
      devices: {
        orderBy: [{ currentStatus: "asc" }, { kind: "asc" }],
        select: {
          id: true,
          kind: true,
          model: true,
          externalId: true,
          currentStatus: true,
          lastSeenAt: true,
          provider: { select: { slug: true, displayName: true } },
        },
      },
    },
  });
  if (!plant) notFound();

  const totalKwp = Number(plant.capacityKwp ?? 0);

  return (
    <>
      <TopBar
        plantId={id}
        plantName={plant.name}
        greetingName={plant.name}
        title="Energía"
        subtitle={`${plant.devices.length} dispositivos · ${totalKwp.toFixed(0)} kWp`}
        showBack
      />
      <main className="mx-auto mt-2 w-full max-w-lg space-y-4 px-5">
        <section className="rounded-[2rem] bg-m3-surface-container-low p-6">
          <div className="flex items-center gap-2">
            <Bolt className="h-5 w-5 text-m3-primary" />
            <h2 className="font-heading text-lg font-bold text-m3-on-surface">
              Dispositivos
            </h2>
          </div>
          <p className="mt-1 text-xs text-m3-outline">
            Estado en vivo de cada inversor conectado a {plant.name}.
          </p>
          {plant.devices.length === 0 ? (
            <p className="mt-6 text-center text-xs italic text-m3-outline">
              Esta planta no tiene dispositivos aún.
            </p>
          ) : (
            <ul className="mt-4 space-y-3">
              {plant.devices.map((d) => {
                const pill = statusPill(d.currentStatus);
                const lastSeen = d.lastSeenAt
                  ? new Date(d.lastSeenAt).toLocaleString("es-CO", {
                      hour: "2-digit",
                      minute: "2-digit",
                      day: "2-digit",
                      month: "short",
                    })
                  : "—";
                return (
                  <li
                    key={d.id}
                    className="flex items-center justify-between gap-3 rounded-2xl bg-m3-surface-container-lowest p-4 shadow-sm"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-heading text-sm font-bold text-m3-on-surface">
                        {d.model ?? d.kind}
                      </p>
                      <p className="truncate text-[11px] text-m3-outline">
                        {d.provider.displayName} · {d.externalId} · {lastSeen}
                      </p>
                    </div>
                    <span
                      className={
                        pill.tone === "ok"
                          ? "rounded-full bg-m3-surface-container-low px-3 py-1 text-[10px] font-bold text-m3-primary"
                          : pill.tone === "warn"
                            ? "rounded-full bg-m3-secondary-container/40 px-3 py-1 text-[10px] font-bold text-m3-on-secondary-container"
                            : pill.tone === "bad"
                              ? "rounded-full bg-red-100 px-3 py-1 text-[10px] font-bold text-red-700"
                              : "rounded-full bg-m3-surface-container-high px-3 py-1 text-[10px] font-bold text-m3-outline"
                      }
                    >
                      {pill.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <Link
          href={`/plantas/${plant.id}`}
          className="flex items-center justify-between gap-3 rounded-2xl bg-m3-surface-container-lowest p-4 shadow-sm transition active:scale-[0.99]"
        >
          <div>
            <p className="font-heading text-sm font-bold text-m3-on-surface">
              Vista técnica avanzada
            </p>
            <p className="text-[11px] text-m3-outline">
              Generación por hora, baseline y predicciones
            </p>
          </div>
          <ArrowRight className="h-4 w-4 text-m3-primary" />
        </Link>
      </main>
    </>
  );
}
