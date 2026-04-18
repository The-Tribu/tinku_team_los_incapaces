import { NextResponse } from "next/server";
import { getGeneration24h } from "@/lib/fleet";

export const dynamic = "force-dynamic";

export async function GET() {
  const series = await getGeneration24h();
  return NextResponse.json({ series });
}
