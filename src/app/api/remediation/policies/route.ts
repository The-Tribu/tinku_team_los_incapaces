import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  const policies = await prisma.remediationPolicy.findMany({
    orderBy: [{ alarmType: "asc" }, { providerSlug: "asc" }],
  });
  return NextResponse.json({ policies });
}
