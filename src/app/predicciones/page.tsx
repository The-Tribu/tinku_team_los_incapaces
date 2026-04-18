import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";
import { PredictionsConsole } from "./predictions-console";

export const dynamic = "force-dynamic";

export default async function PrediccionesPage() {
  const [plants, existing] = await Promise.all([
    prisma.plant.findMany({
      orderBy: { name: "asc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.prediction.findMany({
      take: 30,
      orderBy: { generatedAt: "desc" },
      include: {
        device: {
          select: {
            externalId: true,
            plant: { select: { name: true, code: true, client: { select: { name: true } } } },
          },
        },
      },
    }),
  ]);

  return (
    <AppShell
      title="Predicción de fallas (MiniMax + heurística)"
      subtitle="Adelántate 3–14 días a la próxima falla. No más ir a la planta a buscar el problema."
    >
      <PredictionsConsole
        plants={plants.map((p) => ({
          id: p.id,
          label: `${p.code} · ${p.name}`,
          client: p.client.name,
        }))}
        initialRows={existing.map((r) => ({
          id: r.id,
          predictedType: r.predictedType,
          probability: Number(r.probability),
          daysToEvent: r.daysToEvent ? Number(r.daysToEvent) : null,
          confidence: r.confidence ? Number(r.confidence) : null,
          rootCause: r.rootCause ?? "",
          suggestedAction: r.suggestedAction ?? "",
          generatedAt: r.generatedAt.toISOString(),
          plantName: r.device.plant.name,
          plantCode: r.device.plant.code,
          client: r.device.plant.client.name,
        }))}
      />
    </AppShell>
  );
}
