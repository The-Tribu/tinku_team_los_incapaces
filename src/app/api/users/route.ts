import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ROLES, canAdmin, getSessionUser, hashPassword, normalizeRole } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  const me = await getSessionUser();
  if (!canAdmin(me)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      active: true,
      createdAt: true,
      lastLoginAt: true,
    },
  });
  return NextResponse.json({ users });
}

export async function POST(req: NextRequest) {
  const me = await getSessionUser();
  if (!canAdmin(me)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as {
    email?: string;
    name?: string;
    password?: string;
    role?: string;
  };

  const email = body.email?.toLowerCase().trim();
  const name = body.name?.trim();
  const password = body.password;
  const role = body.role ? normalizeRole(body.role) : "viewer";

  if (!email || !name || !password) {
    return NextResponse.json(
      { error: "email, name y password son requeridos" },
      { status: 400 },
    );
  }
  if (password.length < 8) {
    return NextResponse.json(
      { error: "La contraseña debe tener al menos 8 caracteres" },
      { status: 400 },
    );
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json({ error: "Email inválido" }, { status: 400 });
  }
  if (!ROLES.includes(role)) {
    return NextResponse.json({ error: "Rol inválido" }, { status: 400 });
  }

  const exists = await prisma.user.findUnique({ where: { email } });
  if (exists) {
    return NextResponse.json({ error: "El email ya está registrado" }, { status: 409 });
  }

  const passwordHash = await hashPassword(password);
  const user = await prisma.user.create({
    data: { email, name, passwordHash, role },
    select: { id: true, email: true, name: true, role: true, active: true, createdAt: true },
  });

  return NextResponse.json({ user }, { status: 201 });
}
