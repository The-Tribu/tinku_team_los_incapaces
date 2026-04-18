import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/auth";
import { COMMANDS } from "@/lib/commands";

export const dynamic = "force-dynamic";

// Catálogo público (para que la UI de políticas y la bandeja de remediaciones
// listen comandos disponibles sin hardcodear duplicados).
export async function GET() {
  const me = await getSessionUser();
  if (!me) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = Object.values(COMMANDS).map((c) => ({
    id: c.id,
    label: c.label,
    description: c.description,
    risk: c.risk,
    appliesTo: c.appliesTo,
  }));
  return NextResponse.json({ commands: rows });
}
