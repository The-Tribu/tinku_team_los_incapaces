import { NextResponse } from "next/server";
import { simulateReading, DEMO_STATIONS } from "@/lib/deye-sim";

export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ stationId: string }> },
) {
  const { stationId } = await params;
  const station = DEMO_STATIONS.find((s) => s.id === stationId);
  if (!station) {
    return NextResponse.json({ error: "station not found" }, { status: 404 });
  }
  // simulateReading uses the server-side demo clock (getServerSimHour)
  // so values always reflect daytime solar generation, changing every second.
  const reading = simulateReading(station);
  return NextResponse.json(reading);
}
