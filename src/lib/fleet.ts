/**
 * Fleet-level aggregation helpers — shared between server components and
 * /api routes so the dashboard and JSON API never drift.
 */
import { prisma } from "./prisma";

export type FleetSummary = {
  totalPlants: number;
  onlinePct: number;
  currentPowerMw: number;
  todayEnergyMwh: number;
  activeAlarms: number;
  at_risk: number;
  capacityMw: number;
  byStatus: Record<string, number>;
};

export async function getFleetSummary(): Promise<FleetSummary> {
  const [devices, plants, alarms] = await Promise.all([
    prisma.device.findMany({
      include: {
        plant: { select: { capacityKwp: true } },
        readings: {
          take: 1,
          orderBy: { ts: "desc" },
          select: { powerAcKw: true, energyKwh: true, ts: true },
        },
      },
    }),
    prisma.plant.count(),
    prisma.alarm.count({ where: { resolvedAt: null } }),
  ]);

  const byStatus: Record<string, number> = {};
  let power = 0;
  let energy = 0;
  let capacity = 0;
  let atRisk = 0;

  for (const d of devices) {
    byStatus[d.currentStatus] = (byStatus[d.currentStatus] ?? 0) + 1;
    capacity += Number(d.plant.capacityKwp ?? 0);
    const r = d.readings[0];
    if (r) {
      power += Number(r.powerAcKw ?? 0);
      energy += Number(r.energyKwh ?? 0);
    }
    if (d.currentStatus === "warning" || d.currentStatus === "degraded") atRisk++;
  }

  const online = byStatus.online ?? 0;
  const onlinePct = devices.length > 0 ? (online / devices.length) * 100 : 0;

  return {
    totalPlants: plants,
    onlinePct: Math.round(onlinePct * 10) / 10,
    currentPowerMw: Math.round(power * 10) / 10_000, // kW → MW, 1 decimal
    todayEnergyMwh: Math.round(energy) / 1_000,
    activeAlarms: alarms,
    at_risk: atRisk,
    capacityMw: Math.round(capacity) / 1_000,
    byStatus,
  };
}

export type GenerationPoint = { ts: string; power_kw: number; by_provider: Record<string, number> };

export async function getGeneration24h(): Promise<GenerationPoint[]> {
  const from = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await prisma.$queryRaw<
    Array<{ bucket: Date; provider: string; power_kw: number }>
  >`
    SELECT
      date_trunc('hour', r.ts) AS bucket,
      p.slug                    AS provider,
      COALESCE(SUM(r.power_ac_kw), 0)::float AS power_kw
    FROM readings r
    JOIN devices d   ON d.id          = r.device_id
    JOIN providers p ON p.id          = d.provider_id
    WHERE r.ts >= ${from}
    GROUP BY bucket, p.slug
    ORDER BY bucket ASC
  `;

  const byBucket = new Map<string, GenerationPoint>();
  for (const row of rows) {
    const ts = row.bucket.toISOString();
    const entry =
      byBucket.get(ts) ?? ({ ts, power_kw: 0, by_provider: {} } satisfies GenerationPoint);
    entry.by_provider[row.provider] = row.power_kw;
    entry.power_kw += row.power_kw;
    byBucket.set(ts, entry);
  }

  return [...byBucket.values()].sort((a, b) => a.ts.localeCompare(b.ts));
}

export type TopPlant = {
  id: string;
  code: string;
  name: string;
  client: string;
  capacityKwp: number;
  currentPowerKw: number;
  status: string;
  pr: number;
};

export async function getTopPlants(limit = 5): Promise<TopPlant[]> {
  const plants = await prisma.plant.findMany({
    take: limit,
    orderBy: { capacityKwp: "desc" },
    include: {
      client: { select: { name: true } },
      devices: {
        include: {
          readings: { take: 1, orderBy: { ts: "desc" }, select: { powerAcKw: true } },
        },
      },
    },
  });

  return plants.map((p) => {
    const currentPowerKw = p.devices.reduce(
      (sum, d) => sum + Number(d.readings[0]?.powerAcKw ?? 0),
      0,
    );
    const capacity = Number(p.capacityKwp ?? 0);
    const pr = capacity > 0 ? (currentPowerKw / capacity) * 100 : 0;
    const status = p.devices[0]?.currentStatus ?? "unknown";
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      client: p.client.name,
      capacityKwp: capacity,
      currentPowerKw: Math.round(currentPowerKw * 10) / 10,
      status,
      pr: Math.round(pr * 10) / 10,
    };
  });
}

export type PlantListRow = {
  id: string;
  code: string;
  name: string;
  client: string;
  region: string | null;
  provider: string;
  capacityKwp: number;
  currentPowerKw: number;
  status: string;
  lat: number | null;
  lng: number | null;
  contractType: string | null;
};

export type PlantFilter = {
  status?: string;
  provider?: string;
  region?: string;
  search?: string;
  limit?: number;
  offset?: number;
};

export async function listPlants(filter: PlantFilter = {}): Promise<{
  total: number;
  rows: PlantListRow[];
}> {
  const whereDevice: Record<string, unknown> = {};
  if (filter.status) whereDevice.currentStatus = filter.status;
  if (filter.provider) whereDevice.provider = { slug: filter.provider };

  const wherePlant: Record<string, unknown> = {};
  if (filter.region) wherePlant.client = { region: filter.region };
  if (filter.search) {
    wherePlant.OR = [
      { name: { contains: filter.search, mode: "insensitive" } },
      { code: { contains: filter.search, mode: "insensitive" } },
    ];
  }
  if (Object.keys(whereDevice).length) wherePlant.devices = { some: whereDevice };

  const [total, plants] = await Promise.all([
    prisma.plant.count({ where: wherePlant }),
    prisma.plant.findMany({
      where: wherePlant,
      skip: filter.offset ?? 0,
      take: filter.limit ?? 50,
      orderBy: { code: "asc" },
      include: {
        client: { select: { name: true, region: true } },
        devices: {
          include: {
            provider: { select: { slug: true } },
            readings: { take: 1, orderBy: { ts: "desc" }, select: { powerAcKw: true } },
          },
        },
      },
    }),
  ]);

  const rows: PlantListRow[] = plants.map((p) => {
    const d = p.devices[0];
    const currentPowerKw = p.devices.reduce(
      (sum, dv) => sum + Number(dv.readings[0]?.powerAcKw ?? 0),
      0,
    );
    return {
      id: p.id,
      code: p.code,
      name: p.name,
      client: p.client.name,
      region: p.client.region,
      provider: d?.provider.slug ?? "unknown",
      capacityKwp: Number(p.capacityKwp ?? 0),
      currentPowerKw: Math.round(currentPowerKw * 10) / 10,
      status: d?.currentStatus ?? "unknown",
      lat: p.lat ? Number(p.lat) : null,
      lng: p.lng ? Number(p.lng) : null,
      contractType: p.contractType,
    };
  });

  return { total, rows };
}
