import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { SESSION_COOKIE, clearSessionCookie, deleteSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function POST() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await deleteSession(token);
  await clearSessionCookie();
  return NextResponse.json({ ok: true });
}
