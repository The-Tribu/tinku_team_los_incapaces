import { notFound } from "next/navigation";
import { BarChart3, Download, FileText } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { TopBar } from "../top-bar";

export const dynamic = "force-dynamic";

const COP_PER_KWH = 680;

function monthLabel(d: Date) {
  const s = d.toLocaleDateString("es-CO", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export default async function ReportesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const plant = await prisma.plant.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      devices: { select: { id: true } },
    },
  });
  if (!plant) notFound();

  const deviceIds = plant.devices.map((d) => d.id);

  // Agregación por mes (últimos 3 meses) — delta de energy_kwh acumulada.
  const monthly = deviceIds.length
    ? await prisma.$queryRaw<Array<{ month: Date; energy: number }>>`
        WITH months AS (
          SELECT generate_series(
            date_trunc('month', now() at time zone 'America/Bogota') - INTERVAL '2 months',
            date_trunc('month', now() at time zone 'America/Bogota'),
            INTERVAL '1 month'
          ) AS month
        ),
        per_device AS (
          SELECT
            date_trunc('month', r.ts at time zone 'America/Bogota') AS month,
            r.device_id,
            MAX(r.energy_kwh) - MIN(r.energy_kwh) AS delta
          FROM readings r
          WHERE r.device_id = ANY(${deviceIds}::uuid[])
            AND r.ts >= date_trunc('month', now() at time zone 'America/Bogota') - INTERVAL '3 months'
          GROUP BY 1, 2
        )
        SELECT m.month AS month,
               COALESCE(SUM(p.delta), 0)::float AS energy
        FROM months m
        LEFT JOIN per_device p ON p.month = m.month
        GROUP BY m.month
        ORDER BY m.month DESC
      `
    : [];

  const months = monthly.map((r) => {
    const kwh = Number(r.energy);
    return {
      label: monthLabel(new Date(r.month)),
      kwh: Math.round(kwh).toLocaleString("es-CO"),
      savings: `$${((kwh * COP_PER_KWH) / 1_000_000).toFixed(1)}M`,
    };
  });

  return (
    <>
      <TopBar
        plantId={id}
        plantName={plant.name}
        greetingName={plant.name}
        title="Reportes"
        subtitle={`${plant.name} · histórico mensual`}
        showBack
      />
      <main className="mx-auto mt-2 w-full max-w-lg space-y-4 px-5">
        <section className="rounded-[2rem] bg-gradient-to-br from-m3-primary to-m3-primary-container p-6 text-white shadow-lg">
          <div className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" />
            <h2 className="font-heading text-lg font-bold">Últimos 3 meses</h2>
          </div>
          <p className="mt-1 text-xs text-white/75">
            Descarga tu reporte de generación y ahorro.
          </p>
        </section>

        <ul className="space-y-3">
          {months.length === 0 ? (
            <li className="rounded-2xl bg-m3-surface-container-lowest p-6 text-center text-xs italic text-m3-outline">
              Aún no hay meses con datos suficientes para esta planta.
            </li>
          ) : null}
          {months.map((m) => (
            <li
              key={m.label}
              className="flex items-center justify-between gap-3 rounded-2xl bg-m3-surface-container-lowest p-4 shadow-sm"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-m3-surface-container-low text-m3-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-heading text-sm font-bold text-m3-on-surface">
                    {m.label}
                  </p>
                  <p className="text-[11px] text-m3-outline">
                    {m.kwh} kWh · {m.savings}
                  </p>
                </div>
              </div>
              <button
                type="button"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-m3-surface-container-low text-m3-primary transition active:scale-95"
                aria-label="Descargar reporte"
              >
                <Download className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>

        <p className="text-center text-[11px] italic text-m3-outline">
          Próximamente: exportar PDF y compartir por email.
        </p>
      </main>
    </>
  );
}
