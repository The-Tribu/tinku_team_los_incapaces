import { AppShell } from "@/components/sunhub/app-shell";
import { prisma } from "@/lib/prisma";
import { canWrite, getSessionUser } from "@/lib/auth";
import { MockAlarmTrigger } from "./mock-alarm-trigger";
import { AlarmsCenter, type AlarmItem, type AlarmReadingPoint } from "./alarms-center";

export const dynamic = "force-dynamic";

type Tab = "all" | "new" | "assigned" | "resolved";

function parseTab(v?: string): Tab {
  if (v === "new" || v === "assigned" || v === "resolved") return v;
  return "all";
}

export default async function AlarmsPage({
  searchParams,
}: {
  searchParams: Promise<{
    status?: string;
    severity?: string;
    provider?: string;
    type?: string;
    window?: string;
    selectedId?: string;
  }>;
}) {
  const sp = await searchParams;
  const tab = parseTab(sp.status);

  // Filtro principal derivado de la pestaña
  const where: Record<string, unknown> = {};
  if (tab === "new") {
    where.resolvedAt = null;
    where.assignee = null;
  } else if (tab === "assigned") {
    where.resolvedAt = null;
    where.assignee = { not: null };
  } else if (tab === "resolved") {
    where.resolvedAt = { not: null };
  }
  // "all" no filtra

  if (sp.severity && ["critical", "warning", "info"].includes(sp.severity)) {
    where.severity = sp.severity;
  }
  if (sp.provider) {
    where.device = {
      ...(typeof where.device === "object" && where.device !== null ? where.device : {}),
      provider: { slug: sp.provider },
    };
  }
  if (sp.type) where.type = sp.type;
  if (sp.window === "24h") {
    where.startedAt = { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) };
  }

  const user = await getSessionUser();
  const showMockTrigger = canWrite(user);
  const mockPlants = showMockTrigger
    ? await prisma.plant.findMany({
        orderBy: [{ code: "asc" }],
        select: { id: true, code: true, name: true },
        take: 50,
      })
    : [];

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

  const [
    alarms,
    countAll,
    countNew,
    countAssigned,
    countResolved,
    openCritical,
    openWarning,
    openInfo,
    resolvedSample,
    activeProviders,
  ] = await Promise.all([
    prisma.alarm.findMany({
      where,
      take: 100,
      orderBy: [{ severity: "asc" }, { startedAt: "desc" }],
      include: {
        device: {
          include: {
            plant: { select: { id: true, name: true, code: true } },
            provider: { select: { slug: true, displayName: true } },
          },
        },
      },
    }),
    prisma.alarm.count(),
    prisma.alarm.count({ where: { resolvedAt: null, assignee: null } }),
    prisma.alarm.count({ where: { resolvedAt: null, assignee: { not: null } } }),
    prisma.alarm.count({ where: { resolvedAt: { not: null } } }),
    prisma.alarm.count({ where: { resolvedAt: null, severity: "critical" } }),
    prisma.alarm.count({ where: { resolvedAt: null, severity: "warning" } }),
    prisma.alarm.count({ where: { resolvedAt: null, severity: "info" } }),
    prisma.alarm.findMany({
      where: { resolvedAt: { not: null, gte: thirtyDaysAgo } },
      select: { startedAt: true, resolvedAt: true },
      take: 500,
    }),
    // Catálogo completo de marcas con al menos un dispositivo en flota, para
    // que el filtro muestre Huawei aunque todavía no haya alarmas Huawei.
    prisma.provider.findMany({
      where: { devices: { some: {} } },
      select: { slug: true },
      orderBy: { slug: "asc" },
    }),
  ]);

  // MTTR (mean time-to-resolve) en minutos · ventana 30d
  let mttrMinutes = 0;
  if (resolvedSample.length > 0) {
    const totalMs = resolvedSample.reduce((acc, a) => {
      const end = a.resolvedAt?.getTime() ?? a.startedAt.getTime();
      return acc + Math.max(0, end - a.startedAt.getTime());
    }, 0);
    mttrMinutes = Math.round(totalMs / resolvedSample.length / 60000);
  }

  // SLA: % de alarmas resueltas dentro de 60 min en los últimos 30 días
  let slaPct = 0;
  if (resolvedSample.length > 0) {
    const SLA_BUDGET_MS = 60 * 60 * 1000;
    const within = resolvedSample.filter((a) => {
      const end = a.resolvedAt?.getTime() ?? a.startedAt.getTime();
      return end - a.startedAt.getTime() <= SLA_BUDGET_MS;
    }).length;
    slaPct = (within / resolvedSample.length) * 100;
  }

  // Marcas disponibles para el filtro: catálogo de proveedores con
  // dispositivos activos. Se unifican con los proveedores presentes en las
  // alarmas visibles por si alguno quedó sin `device` (edge case legacy).
  const providerSlugs = Array.from(
    new Set([
      ...activeProviders.map((p) => p.slug),
      ...alarms.map((a) => a.device.provider.slug),
    ]),
  ).sort();

  // Mapa a formato cliente
  const items: AlarmItem[] = alarms.map((a) => ({
    id: a.id,
    severity: (a.severity as AlarmItem["severity"]) ?? "info",
    type: a.type,
    source: a.source,
    message: a.message,
    startedAt: a.startedAt.toISOString(),
    resolvedAt: a.resolvedAt?.toISOString() ?? null,
    acknowledgedAt: a.acknowledgedAt?.toISOString() ?? null,
    aiSuggestion: a.aiSuggestion,
    assignee: a.assignee,
    device: {
      id: a.device.id,
      externalId: a.device.externalId,
      kind: a.device.kind,
      model: a.device.model,
      currentStatus: a.device.currentStatus,
    },
    plant: {
      id: a.device.plant.id,
      name: a.device.plant.name,
      code: a.device.plant.code,
    },
    provider: {
      slug: a.device.provider.slug,
      displayName: a.device.provider.displayName,
    },
  }));

  // Selección: query param o primer item
  const selectedId = sp.selectedId && items.find((i) => i.id === sp.selectedId)
    ? sp.selectedId
    : items[0]?.id ?? null;

  // Lecturas para el detalle: últimas 48h del device seleccionado
  let selectedReadings: AlarmReadingPoint[] = [];
  const selected = items.find((i) => i.id === selectedId);
  if (selected) {
    const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
    const rows = await prisma.reading.findMany({
      where: { deviceId: selected.device.id, ts: { gte: since } },
      orderBy: { ts: "asc" },
      select: { ts: true, powerAcKw: true, voltageV: true, temperatureC: true },
      take: 200,
    });
    selectedReadings = rows.map((r) => ({
      ts: r.ts.toISOString(),
      powerKw: r.powerAcKw ? Number(r.powerAcKw) : null,
      voltageV: r.voltageV ? Number(r.voltageV) : null,
      temperatureC: r.temperatureC ? Number(r.temperatureC) : null,
    }));
  }

  return (
    <AppShell
      title="Centro de Alarmas"
      subtitle={`${countNew + countAssigned} abiertas · ${openCritical} críticas · SLA ${slaPct.toFixed(1)}%`}
    >
      {showMockTrigger ? (
        <div className="mb-4">
          <MockAlarmTrigger plants={mockPlants} />
        </div>
      ) : null}

      <AlarmsCenter
        items={items}
        selectedId={selectedId}
        readings={selectedReadings}
        counts={{
          all: countAll,
          new: countNew,
          assigned: countAssigned,
          resolved: countResolved,
          critical: openCritical,
          warning: openWarning,
          info: openInfo,
        }}
        kpis={{
          mttrMinutes,
          slaPct,
        }}
        filters={{
          tab,
          severity: sp.severity ?? null,
          provider: sp.provider ?? null,
          type: sp.type ?? null,
          window: sp.window ?? null,
        }}
        providerSlugs={providerSlugs}
      />
    </AppShell>
  );
}
