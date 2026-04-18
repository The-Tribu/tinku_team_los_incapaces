import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getWeatherForPlant } from "@/lib/weather";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const plantId = new URL(req.url).searchParams.get("plantId");
  if (!plantId) return NextResponse.json({ error: "plantId required" }, { status: 400 });
  const plant = await prisma.plant.findUnique({ where: { id: plantId } });
  if (!plant) return NextResponse.json({ error: "plant not found" }, { status: 404 });

  const lat = Number(plant.lat ?? 4.6);
  const lng = Number(plant.lng ?? -74.1);
  const capacity = Number(plant.capacityKwp ?? 0);
  try {
    const weather = await getWeatherForPlant(lat, lng, capacity);
    return NextResponse.json({
      plant: { id: plant.id, name: plant.name, code: plant.code, capacityKwp: capacity },
      weather,
    });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 502 });
  }
}
