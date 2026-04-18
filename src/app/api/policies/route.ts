import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toPolicyView } from "@/lib/policies";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const plants = await prisma.plant.findMany({
    orderBy: { name: "asc" },
    select: {
      id: true,
      code: true,
      name: true,
      client: { select: { name: true } },
      policy: true,
      _count: { select: { remediations: true } },
    },
  });
  const rows = plants.map((p) => ({
    id: p.id,
    code: p.code,
    name: p.name,
    client: p.client.name,
    policy: p.policy ? toPolicyView(p.policy) : null,
    remediationsTotal: p._count.remediations,
  }));
  return NextResponse.json({ rows });
}
