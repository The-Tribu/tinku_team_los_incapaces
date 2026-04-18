import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight } from "lucide-react";
import { AppShell } from "@/components/sunhub/app-shell";
import { getSessionUser, canWrite } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { displayClientLabel } from "@/lib/display";
import { RemediationsBoard } from "./remediations-board";

export const dynamic = "force-dynamic";

const STATUS_TABS = ["proposed", "approved", "executed", "failed", "verified", "cancelled"] as const;

type Search = { status?: string; plantId?: string };

export default async function RemediacionesPage({
  searchParams,
}: {
  searchParams: Promise<Search>;
}) {
  const me = await getSessionUser();
  if (!me) redirect("/login");
  if (!canWrite(me)) redirect("/dashboard");

  const sp = await searchParams;
  const activeStatus = (STATUS_TABS as readonly string[]).includes(sp.status ?? "")
    ? sp.status!
    : "proposed";
  const plantFilter = sp.plantId && sp.plantId.length > 0 ? sp.plantId : null;

  const where: Record<string, unknown> = { status: activeStatus };
  if (plantFilter) where.plantId = plantFilter;

  const [rows, plants, counts] = await Promise.all([
    prisma.remediation.findMany({
      where,
      orderBy: { proposedAt: "desc" },
      take: 100,
      include: {
        plant: { select: { id: true, name: true, code: true, client: { select: { name: true } } } },
        device: { select: { externalId: true, provider: { select: { slug: true } } } },
        alarm: { select: { id: true, type: true, severity: true } },
      },
    }),
    prisma.plant.findMany({
      orderBy: { name: "asc" },
      select: { id: true, name: true, code: true, client: { select: { name: true } } },
    }),
    prisma.remediation.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  const countByStatus = Object.fromEntries(
    counts.map((c) => [c.status, c._count._all]),
  ) as Record<string, number>;

  const items = rows.map((r) => ({
    id: r.id,
    plantId: r.plantId,
    plantName: r.plant.name,
    plantCode: r.plant.code,
    clientLabel: displayClientLabel(r.plant.client, { name: r.plant.name }),
    deviceExternalId: r.device?.externalId ?? null,
    providerSlug: r.device?.provider.slug ?? null,
    commandType: r.commandType,
    reason: r.reason,
    status: r.status,
    executionMode: r.executionMode,
    proposedBy: r.proposedBy,
    proposedAt: r.proposedAt.toISOString(),
    executedAt: r.executedAt?.toISOString() ?? null,
    verifiedOutcome: r.verifiedOutcome,
    aiConfidence: r.aiConfidence ? Number(r.aiConfidence) : null,
    retryCount: r.retryCount,
    nextRetryAt: r.nextRetryAt?.toISOString() ?? null,
    alarm: r.alarm
      ? { id: r.alarm.id, type: r.alarm.type, severity: r.alarm.severity }
      : null,
  }));

  return (
    <AppShell
      title="Remediaciones · Bandeja del agente"
      subtitle="Acciones correctivas propuestas, aprobadas y ejecutadas por el self-repair agentic"
      actions={
        <Link
          href="/configuracion"
          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-700 hover:bg-slate-50"
        >
          Configurar políticas <ChevronRight className="h-3 w-3" />
        </Link>
      }
    >
      <RemediationsBoard
        items={items}
        plants={plants.map((p) => ({
          id: p.id,
          name: p.name,
          code: p.code,
          clientLabel: displayClientLabel(p.client, { name: p.name }),
        }))}
        activeStatus={activeStatus}
        plantFilter={plantFilter}
        countByStatus={countByStatus}
        canApprove={me.role === "admin" || me.role === "ops"}
      />
    </AppShell>
  );
}
