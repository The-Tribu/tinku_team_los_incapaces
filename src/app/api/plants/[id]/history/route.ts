import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { fetchHuaweiStationHour } from "@/lib/huawei";
import { MiddlewareError, MiddlewareRateLimitError } from "@/lib/middleware";

export const dynamic = "force-dynamic";

/**
 * GET /api/plants/[id]/history?source=upstream
 *
 * `source=upstream` trae la curva horaria directamente del proveedor
 * (Huawei: getKpiStationHour). Sin parámetros usa la DB local.
 *
 * Útil para contrastar los datos ingestados contra los que ve el dashboard
 * del fabricante, o para llenar vacíos si el cron se ha caído.
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const source = req.nextUrl.searchParams.get("source") ?? "local";

  const plant = await prisma.plant.findUnique({
    where: { id },
    include: {
      devices: {
        include: { provider: true },
        take: 1,
      },
    },
  });
  if (!plant) {
    return NextResponse.json({ error: "plant_not_found" }, { status: 404 });
  }

  if (source === "upstream") {
    const providerSlug = plant.devices[0]?.provider.slug;
    const externalId = plant.devices[0]?.externalId ?? plant.code;
    if (providerSlug !== "huawei") {
      return NextResponse.json(
        { error: "upstream_not_supported", provider: providerSlug ?? null },
        { status: 400 },
      );
    }
    try {
      const points = await fetchHuaweiStationHour(externalId);
      return NextResponse.json({
        source: "upstream",
        provider: "huawei",
        plantId: plant.id,
        externalId,
        points,
      });
    } catch (err) {
      if (err instanceof MiddlewareRateLimitError) {
        return NextResponse.json(
          { error: "rate_limited", retry_after_seconds: err.retryAfterSec },
          { status: 429 },
        );
      }
      if (err instanceof MiddlewareError) {
        return NextResponse.json(
          { error: "upstream_error", status: err.status, message: err.message },
          { status: 502 },
        );
      }
      return NextResponse.json(
        { error: "unexpected", message: (err as Error).message },
        { status: 500 },
      );
    }
  }

  // source=local: últimas 24h agregadas por hora desde la DB
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const readings = await prisma.reading.findMany({
    where: {
      ts: { gte: since },
      device: { plantId: plant.id },
    },
    orderBy: { ts: "asc" },
    select: { ts: true, powerAcKw: true, energyKwh: true },
  });
  const byHour = new Map<string, { power: number; energy: number }>();
  for (const r of readings) {
    const k = new Date(r.ts).toISOString().slice(0, 13);
    const acc = byHour.get(k) ?? { power: 0, energy: 0 };
    acc.power += Number(r.powerAcKw ?? 0);
    acc.energy += Number(r.energyKwh ?? 0);
    byHour.set(k, acc);
  }
  const points = Array.from(byHour.entries()).map(([k, v]) => ({
    ts: `${k}:00:00.000Z`,
    powerKw: v.power,
    energyKwh: v.energy,
  }));
  return NextResponse.json({
    source: "local",
    plantId: plant.id,
    points,
  });
}
