import { NextRequest, NextResponse } from "next/server";
import { listPlants } from "@/lib/fleet";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const result = await listPlants({
    status: sp.get("status") ?? undefined,
    provider: sp.get("provider") ?? undefined,
    region: sp.get("region") ?? undefined,
    search: sp.get("q") ?? undefined,
    limit: sp.get("limit") ? Number(sp.get("limit")) : undefined,
    offset: sp.get("offset") ? Number(sp.get("offset")) : undefined,
  });
  return NextResponse.json(result);
}
