import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionUser } from "@/lib/auth";

export const dynamic = "force-dynamic";

// Lista de responsables disponibles para asignar una alarma.
// Cualquier usuario autenticado puede leerla (no solo admin).
// Solo retorna usuarios activos con rol admin|ops.
export async function GET() {
  const me = await getSessionUser();
  if (!me) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const users = await prisma.user.findMany({
    where: { active: true, role: { in: ["admin", "ops"] } },
    orderBy: [{ role: "asc" }, { name: "asc" }],
    select: { id: true, name: true, email: true, role: true },
  });
  return NextResponse.json({ users });
}
