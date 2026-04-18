import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES, canAdmin, getSessionUser, hashPassword, normalizeRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

type PatchBody = {
  name?: string;
  role?: string;
  active?: boolean;
  password?: string;
};

export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!canAdmin(me)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = (await req.json().catch(() => ({}))) as PatchBody;

  const data: Record<string, unknown> = {};
  if (typeof body.name === "string" && body.name.trim()) data.name = body.name.trim();
  if (typeof body.role === "string") {
    const role = normalizeRole(body.role);
    if (!ROLES.includes(role)) {
      return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
    }
    data.role = role;
  }
  if (typeof body.active === "boolean") {
    if (!body.active && id === me!.id) {
      return NextResponse.json({ error: "No puedes desactivarte a ti mismo" }, { status: 400 });
    }
    data.active = body.active;
  }
  if (typeof body.password === "string" && body.password) {
    if (body.password.length < 8) {
      return NextResponse.json(
        { error: "La contraseña debe tener al menos 8 caracteres" },
        { status: 400 },
      );
    }
    data.passwordHash = await hashPassword(body.password);
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Sin cambios" }, { status: 400 });
  }

  const user = await prisma.user.update({
    where: { id },
    data,
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true, lastLoginAt: true },
  });
  return NextResponse.json({ user });
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const me = await getSessionUser();
  if (!canAdmin(me)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (id === me!.id) {
    return NextResponse.json({ error: "No puedes eliminarte a ti mismo" }, { status: 400 });
  }
  await prisma.user.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
