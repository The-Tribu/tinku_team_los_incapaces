import { AppShell } from "@/components/sunhub/app-shell";
import { canWrite, getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { PredictionsConsole } from "./predictions-console";

export const dynamic = "force-dynamic";

export default async function PrediccionesPage() {
  const me = await getSessionUser();
  const [plants, existing] = await Promise.all([
    prisma.plant.findMany({
      orderBy: { name: "asc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.prediction.findMany({
      take: 60,
      orderBy: { generatedAt: "desc" },
      include: {
        device: {
          select: {
            externalId: true,
            plant: { select: { id: true, name: true, code: true, client: { select: { name: true } } } },
          },
        },
        outcome: true,
        sourceAlarm: { select: { id: true, severity: true, type: true, message: true } },
        remediations: {
          select: { id: true, commandType: true, status: true, executionMode: true },
          orderBy: { proposedAt: "desc" },
          take: 3,
        },
      },
    }),
  ]);

  return (
    <AppShell
      title="Predicción de fallas · heurística + RAG + MiniMax"
      subtitle="Proactivo (anomalías), reactivo (alarmas) y programado — con memoria de aciertos pasados"
    >
      <PredictionsConsole
        canRun={canWrite(me)}
        plants={plants.map((p) => ({
          id: p.id,
          code: p.code,
          name: p.name,
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
          modelVersion: r.modelVersion ?? "heuristic",
          triggerKind: (r.triggerKind as "scheduled" | "alarm" | "anomaly") ?? "scheduled",
          sourceAlarm: r.sourceAlarm,
          plantId: r.device.plant.id,
          plantName: r.device.plant.name,
          plantCode: r.device.plant.code,
          client: r.device.plant.client.name,
          outcome: r.outcome
            ? { status: r.outcome.status, notes: r.outcome.notes, decidedAt: r.outcome.decidedAt.toISOString() }
            : null,
          remediations: r.remediations.map((rem) => ({
            id: rem.id,
            commandType: rem.commandType,
            status: rem.status,
            executionMode: rem.executionMode,
          })),
        }))}
      />
    </AppShell>
  );
}
