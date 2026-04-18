import { AppShell } from "@/components/sunhub/app-shell";
import { displayClientLabel } from "@/lib/display";
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
      title="Inteligencia climática"
      subtitle="Pronóstico meteorológico + radiación solar cruzada con 218 plantas · powered by Open-Meteo"
    >
      <WeatherConsole
        plants={plants.map((p) => ({
          id: p.id,
          label: `${p.code} · ${p.name}`,
          client: displayClientLabel(p.client, { name: p.name }),
          capacityKwp: Number(p.capacityKwp ?? 0),
        }))}
      />
    </AppShell>
  );
}
