import { NextRequest, NextResponse } from "next/server";
import { executeRemediation } from "@/lib/remediation/executor";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    alarmId?: string;
    dryRun?: boolean;
    action?: string;
  };
  if (!body.alarmId) {
    return NextResponse.json({ error: "alarmId required" }, { status: 400 });
  }
  const result = await executeRemediation(body.alarmId, "manual", {
    forceDryRun: body.dryRun === true,
    overrideAction: body.action,
  });
  return NextResponse.json(result);
}
