import { NextRequest, NextResponse } from "next/server";
import { runSchedule } from "@/lib/report-schedules";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const res = await runSchedule(id);
  if (!res.ok) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
