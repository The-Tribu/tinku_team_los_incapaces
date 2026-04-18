#!/usr/bin/env tsx
/**
 * Borra todos los datos comerciales / operacionales de la BD y (opcionalmente)
 * vuelve a sincronizar plantas reales desde el middleware.
 *
 * Preserva: User, Session, Provider (y los catálogos del sistema).
 * Elimina:  Client, Plant, Device, Reading, Alarm, Prediction, Contract, Report.
 *
 * Uso:
 *   npx tsx scripts/reset-data.ts                  # limpia + re-sync + ingest
 *   npx tsx scripts/reset-data.ts --no-sync        # solo limpia
 *   npx tsx scripts/reset-data.ts --no-ingest      # limpia + re-sync (sin ingest)
 *   npx tsx scripts/reset-data.ts --yes            # sin confirmación interactiva
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { createInterface } from "node:readline/promises";

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

async function confirm(): Promise<boolean> {
  if (process.argv.includes("--yes") || process.argv.includes("-y")) return true;
  if (!process.stdin.isTTY) return true;
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const ans = await rl.question(
    "⚠️  Esto borrará TODAS las plantas, lecturas, alarmas, predicciones y contratos.\n" +
      "   Se preservan: usuarios, sesiones y proveedores.\n" +
      "   ¿Continuar? (yes/NO) ",
  );
  rl.close();
  return ans.trim().toLowerCase() === "yes" || ans.trim().toLowerCase() === "y";
}

async function purge() {
  console.log("→ Purgando datos comerciales/operacionales…");
  // Orden: desde hijas hacia padres. El cascade cubriría los hijos desde
  // Plant/Client, pero hacemos deletes explícitos para reportar conteos.
  const reports = await prisma.report.deleteMany({});
  const predictions = await prisma.prediction.deleteMany({});
  const alarms = await prisma.alarm.deleteMany({});
  const readings = await prisma.reading.deleteMany({});
  const contracts = await prisma.contract.deleteMany({});
  const devices = await prisma.device.deleteMany({});
  const plants = await prisma.plant.deleteMany({});
  const clients = await prisma.client.deleteMany({});

  console.log(
    [
      `  ✓ readings:    ${readings.count}`,
      `  ✓ alarms:      ${alarms.count}`,
      `  ✓ predictions: ${predictions.count}`,
      `  ✓ contracts:   ${contracts.count}`,
      `  ✓ devices:     ${devices.count}`,
      `  ✓ plants:      ${plants.count}`,
      `  ✓ clients:     ${clients.count}`,
      `  ✓ reports:     ${reports.count}`,
    ].join("\n"),
  );

  const survivors = {
    users: await prisma.user.count(),
    sessions: await prisma.session.count(),
    providers: await prisma.provider.count(),
  };
  console.log(`  ↳ preservados: users=${survivors.users} · sessions=${survivors.sessions} · providers=${survivors.providers}`);
}

async function main() {
  const ok = await confirm();
  if (!ok) {
    console.log("Cancelado.");
    return;
  }

  await purge();

  const doSync = !process.argv.includes("--no-sync");
  const doIngest = !process.argv.includes("--no-ingest");

  if (doSync) {
    console.log("\n→ Sincronizando plantas reales desde el middleware…");
    const { syncRealPlants } = await import("./sync-real-plants");
    await syncRealPlants();
  }

  if (doSync && doIngest) {
    console.log("\n→ Corriendo un tick inicial de ingest…");
    const { tick } = await import("../src/workers/ingest");
    await tick();
  }

  const plants = await prisma.plant.count();
  const devices = await prisma.device.count();
  const readings = await prisma.reading.count();
  console.log(`\n✓ Estado final · plants=${plants} · devices=${devices} · readings=${readings}`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
