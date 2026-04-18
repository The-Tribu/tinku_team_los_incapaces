#!/usr/bin/env tsx
/**
 * Crea o actualiza un usuario desde CLI.
 * Uso típico: bootstrap del primer admin antes de que exista cualquier sesión.
 *
 * Ejemplos:
 *   make create-user EMAIL=ops@sunhub.co PASSWORD=cambiar123 ROLE=admin NAME="Roberto Striana"
 *   EMAIL=ops@sunhub.co PASSWORD=cambiar123 npx tsx scripts/create-user.ts
 *   npx tsx scripts/create-user.ts --email a@b.c --password "x" --role admin --name "A"
 *
 * Comportamiento:
 *   - Si el email ya existe → actualiza password/rol/nombre y lo reactiva.
 *   - Si no existe → lo crea.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

for (const f of [".env.local", ".env"]) {
  const p = resolve(process.cwd(), f);
  if (!existsSync(p)) continue;
  for (const line of readFileSync(p, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
    if (!m || m[1].startsWith("#")) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
  }
}

import { prisma } from "../src/lib/prisma";
import { ROLES, hashPassword, normalizeRole } from "../src/lib/auth";

function argv(flag: string) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

async function main() {
  const email = (argv("--email") ?? process.env.EMAIL ?? "").toLowerCase().trim();
  const password = argv("--password") ?? process.env.PASSWORD ?? "";
  const name = argv("--name") ?? process.env.NAME ?? email.split("@")[0];
  const roleInput = argv("--role") ?? process.env.ROLE ?? "admin";

  if (!email || !password) {
    console.error("✗ Faltan argumentos. Usa: EMAIL=... PASSWORD=... [ROLE=admin|ops|viewer] [NAME=...]");
    process.exit(1);
  }
  if (password.length < 8) {
    console.error("✗ La contraseña debe tener al menos 8 caracteres.");
    process.exit(1);
  }

  const role = normalizeRole(roleInput);
  if (!ROLES.includes(role)) {
    console.error(`✗ Rol inválido "${roleInput}". Usa: admin | ops | viewer`);
    process.exit(1);
  }

  const passwordHash = await hashPassword(password);
  const existing = await prisma.user.findUnique({ where: { email } });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { passwordHash, name, role, active: true },
    });
    console.log(`✓ Usuario actualizado: ${email} · rol=${role}`);
  } else {
    await prisma.user.create({
      data: { email, name, passwordHash, role },
    });
    console.log(`✓ Usuario creado: ${email} · rol=${role}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
