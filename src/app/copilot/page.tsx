import { AppShell } from "@/components/sunhub/app-shell";
import { displayClientLabel } from "@/lib/display";
import { prisma } from "@/lib/prisma";
import { CopilotChat } from "./copilot-chat";

export const dynamic = "force-dynamic";

export default async function CopilotPage() {
  // Reportes recientes para el panel lateral automático.
  const recent = await prisma.report.findMany({
    take: 8,
    orderBy: { generatedAt: "desc" },
    include: {
      plant: { select: { name: true, code: true } },
      client: { select: { name: true } },
    },
  });

  const reportsGenerated = await prisma.report.count();

  return (
    <AppShell
      title="SunHub Copilot"
      subtitle="Pregunta a tu IA de operaciones · conectado a 218 plantas y 1.247 dispositivos"
    >
      <CopilotChat
        reports={recent.map((r) => ({
          id: r.id,
          title: r.plant?.name
            ? `Reporte ${r.period.toLocaleDateString("es-CO", { month: "long", year: "numeric" })}`
            : `Reporte ${displayClientLabel(r.client, r.plant)}`,
          plantName: r.plant?.name ?? r.client.name,
          plantCode: r.plant?.code ?? "",
          clientName: displayClientLabel(r.client, r.plant),
          status: r.status,
          generatedAt: r.generatedAt.toISOString(),
        }))}
        kpis={{
          hoursSaved: 128,
          hoursTarget: 218,
          reportsGenerated,
        }}
      />
    </AppShell>
  );
}
