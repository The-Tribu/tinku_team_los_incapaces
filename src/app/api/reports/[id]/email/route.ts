import { NextRequest, NextResponse } from "next/server";
import { sendReportEmail } from "@/lib/report-mailer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

type Params = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { to?: string };
  const res = await sendReportEmail(id, body.to);
  if (!res.ok) return NextResponse.json(res, { status: 400 });
  return NextResponse.json(res);
}
