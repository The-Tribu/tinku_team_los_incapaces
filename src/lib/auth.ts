/**
 * SunHub · Auth helpers
 *
 * Sessions: random 64-hex token stored in DB with expiresAt, mirrored in an
 * httpOnly cookie. No JWT — we want instant server-side invalidation.
 *
 * Passwords: scrypt (built-in Node crypto, no extra deps). Format stored in
 * DB is `scrypt:<saltHex>:<keyHex>` so we can swap hashers later.
 */
import { cookies } from "next/headers";
import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { prisma } from "./prisma";

export const SESSION_COOKIE = "sunhub_session";
const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

export const ROLES = ["admin", "ops", "viewer"] as const;
export type Role = (typeof ROLES)[number];

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: Role;
};

// ─── Password hashing ────────────────────────────────────────────────
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, (err, derived) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt.toString("hex")}:${(derived as Buffer).toString("hex")}`);
    });
  });
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split(":");
  if (parts.length !== 3 || parts[0] !== "scrypt") return false;
  const salt = Buffer.from(parts[1], "hex");
  const expected = Buffer.from(parts[2], "hex");
  return new Promise((resolve, reject) => {
    scrypt(password, salt, expected.length, (err, derived) => {
      if (err) return reject(err);
      const buf = derived as Buffer;
      resolve(buf.length === expected.length && timingSafeEqual(buf, expected));
    });
  });
}

// ─── Session CRUD ────────────────────────────────────────────────────
export async function createSession(userId: string) {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  return { token, expiresAt };
}

export async function deleteSession(token: string) {
  await prisma.session.deleteMany({ where: { token } });
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const session = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date()) return null;
  if (!session.user.active) return null;
  return {
    id: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: normalizeRole(session.user.role),
  };
}

// ─── Role checks ─────────────────────────────────────────────────────
export function normalizeRole(r: string): Role {
  return (ROLES as readonly string[]).includes(r) ? (r as Role) : "viewer";
}

export function hasRole(user: SessionUser | null, allowed: Role | Role[]): boolean {
  if (!user) return false;
  const set = Array.isArray(allowed) ? allowed : [allowed];
  return set.includes(user.role);
}

export function canWrite(user: SessionUser | null): boolean {
  return hasRole(user, ["admin", "ops"]);
}

export function canAdmin(user: SessionUser | null): boolean {
  return hasRole(user, "admin");
}

// ─── Cookie helpers ──────────────────────────────────────────────────
export async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(SESSION_COOKIE);
}
