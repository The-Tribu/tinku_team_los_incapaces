/**
 * Runner en background para corridas masivas de predicciones.
 *
 * Se invoca con `void runBulkPredictionJob(...)` desde el endpoint POST —
 * el endpoint devuelve el jobId al cliente mientras este promise sigue
 * iterando sobre las plantas. Cada planta procesada actualiza el row en
 * `prediction_jobs` para que el UI pueda polear y pintar el spinner.
 */
import { prisma } from "./prisma";
import { predictForPlant } from "./predictions";

type PlantRef = { id: string; name: string; code: string };

export type BulkJobResultItem = {
  plantId: string;
  plantName: string;
  predictions: number;
  error?: string;
};

export async function runBulkPredictionJob(jobId: string, plants: PlantRef[]) {
  // Marca el job como running.
  await prisma.predictionJob.update({
    where: { id: jobId },
    data: { status: "running", totalCount: plants.length },
  });

  const results: BulkJobResultItem[] = [];
  let totalPredictions = 0;
  let successCount = 0;
  let failedCount = 0;

  for (let i = 0; i < plants.length; i++) {
    const plant = plants[i];
    const label = `${plant.code} · ${plant.name}`;

    // Avisa qué planta se está procesando ahora — el UI lo puede mostrar.
    await prisma.predictionJob.update({
      where: { id: jobId },
      data: { currentPlant: label },
    });

    try {
      const preds = await predictForPlant(plant.id, { triggerKind: "scheduled" });
      totalPredictions += preds.length;
      successCount += 1;
      results.push({ plantId: plant.id, plantName: label, predictions: preds.length });
    } catch (err) {
      failedCount += 1;
      results.push({
        plantId: plant.id,
        plantName: label,
        predictions: 0,
        error: (err as Error).message.slice(0, 200),
      });
    }

    await prisma.predictionJob.update({
      where: { id: jobId },
      data: {
        processedCount: i + 1,
        successCount,
        failedCount,
        totalPredictions,
      },
    });
  }

  await prisma.predictionJob.update({
    where: { id: jobId },
    data: {
      status: failedCount > 0 && successCount === 0 ? "failed" : "completed",
      finishedAt: new Date(),
      currentPlant: null,
      results: results as unknown as object,
      error: failedCount > 0 && successCount === 0 ? "Todas las plantas fallaron" : null,
    },
  });
}
