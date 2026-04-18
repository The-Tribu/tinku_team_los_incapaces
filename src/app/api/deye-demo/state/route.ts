/**
 * GET  /api/deye-demo/state  — snapshot de todas las estaciones (usado por el scraper)
 * POST /api/deye-demo/state  — la landing puede enviar su estado (opcional, informativo)
 */
import { NextResponse } from "next/server";
import { simulateReading, DEMO_STATIONS } from "@/lib/deye-sim";

export const dynamic = "force-dynamic";

/** Devuelve el estado actual de todas las estaciones según el reloj demo del servidor. */
export async function GET() {
  const readings = DEMO_STATIONS.map((station) => simulateReading(station));
  return NextResponse.json(readings);
}

/** La landing page puede hacer POST para sincronizar su estado visual (no requerido). */
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body?.stationId) return NextResponse.json({ ok: false }, { status: 400 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
}
