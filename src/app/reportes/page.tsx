import { AppShell } from "@/components/sunhub/app-shell";
import { displayClientLabel } from "@/lib/display";
import { prisma } from "@/lib/prisma";
import { describeCadence, describeNextRun } from "@/lib/report-schedules";
import { ReportsConsole } from "./generate-form";

export const dynamic = "force-dynamic";

export default async function ReportsPage() {
  const [plants, reports, schedules] = await Promise.all([
    prisma.plant.findMany({
      orderBy: { name: "asc" },
      include: { client: { select: { name: true } } },
    }),
    prisma.report.findMany({
      take: 24,
      orderBy: { generatedAt: "desc" },
      include: {
        plant: {
          select: {
            name: true,
            code: true,
            client: { select: { contactEmail: true } },
          },
        },
        client: { select: { name: true, contactEmail: true } },
      },
    }),
    prisma.reportSchedule.findMany({
      orderBy: [{ active: "desc" }, { nextRunAt: "asc" }],
      include: {
        plant: { select: { name: true, code: true } },
        client: { select: { name: true } },
      },
    }),
  ]);

  const reportsThisMonthStart = new Date();
  reportsThisMonthStart.setDate(1);
  reportsThisMonthStart.setHours(0, 0, 0, 0);
  const reportsThisMonth = await prisma.report.count({
    where: { generatedAt: { gte: reportsThisMonthStart } },
  });

  const sentCount = await prisma.report.count({ where: { status: "sent" } });
  const totalCount = await prisma.report.count();
  const deliveryPct = totalCount > 0 ? (sentCount / totalCount) * 100 : 0;

  const nextSchedule = schedules
    .filter((s) => s.active && s.nextRunAt)
    .sort((a, b) => (a.nextRunAt!.getTime() - b.nextRunAt!.getTime()))[0];

  return (
    <AppShell
      title="Reportes mensuales automatizados"
      subtitle="40 min/planta → menos de 30 seg con SunHub · entrega por correo y portal"
    >
      <ReportsConsole
        plants={plants.map((p) => ({
          id: p.id,
          label: `${p.code} · ${p.name}`,
          client: displayClientLabel(p.client, { name: p.name }),
        }))}
        reports={reports.map((r) => ({
          id: r.id,
          plantName: r.plant?.name ?? r.client.name,
          plantCode: r.plant?.code ?? "",
          clientName: displayClientLabel(r.client, r.plant),
          periodLabel: r.period.toLocaleDateString("es-CO", { month: "long", year: "numeric" }),
          status: r.status,
          compliancePct: r.compliancePct ? Number(r.compliancePct) : null,
          generatedAt: r.generatedAt.toISOString(),
          defaultEmail:
            r.plant?.client?.contactEmail ?? r.client.contactEmail ?? null,
        }))}
        schedules={schedules.map((s) => ({
          id: s.id,
          title: s.title,
          cadence: s.cadence,
          cadenceLabel: describeCadence(s),
          dayOfMonth: s.dayOfMonth,
          dayOfWeek: s.dayOfWeek,
          hour: s.hour,
          minute: s.minute,
          recipientEmail: s.recipientEmail,
          active: s.active,
          nextRunAt: s.nextRunAt?.toISOString() ?? null,
          nextRunLabel: s.nextRunAt ? describeNextRun(s.nextRunAt) : "—",
          lastStatus: s.lastStatus,
          lastError: s.lastError,
          plantId: s.plantId,
          plantName: s.plant?.name ?? null,
          plantCode: s.plant?.code ?? null,
          clientName: s.client?.name ?? null,
        }))}
        kpis={{
          reportsThisMonth,
          hoursSaved: reportsThisMonth * 0.6,
          nextScheduled: nextSchedule?.nextRunAt
            ? describeNextRun(nextSchedule.nextRunAt)
            : "—",
          deliveryPct,
        }}
      />
    </AppShell>
  );
}
