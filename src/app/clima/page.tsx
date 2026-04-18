import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";
import { WeatherConsole } from "./weather-console";

export const dynamic = "force-dynamic";

export default async function ClimaPage() {
  const plants = await prisma.plant.findMany({
    orderBy: { name: "asc" },
    include: { client: { select: { name: true } } },
  });
  return (
    <AppShell
      title="Clima + generación esperada"
      subtitle="Pronóstico 5 días con Open-Meteo · planifica mantenimientos donde el lucro cesante es menor"
    >
      <WeatherConsole
        plants={plants.map((p) => ({
          id: p.id,
          label: `${p.code} · ${p.name}`,
          client: p.client.name,
          capacityKwp: Number(p.capacityKwp ?? 0),
        }))}
      />
    </AppShell>
  );
}
