import { NextResponse } from "next/server";
import { getFleetSummary } from "@/lib/fleet";

export const dynamic = "force-dynamic";

export async function GET() {
  const summary = await getFleetSummary();
  return NextResponse.json(summary);
}
