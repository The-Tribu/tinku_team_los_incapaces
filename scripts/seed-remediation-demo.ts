#!/usr/bin/env tsx
/**
 * Demo seed for the auto-remediation agent.
 *
 * Crea (o refresca) una alarma `low_gen` de severidad `warning` sobre una
 * planta Deye del seed base, dispara el evaluator y deja la acción registrada
 * para que se vea en `/auto-reparacion` y `/alarmas`.
 *
 * Uso: `npm run demo:remediation`
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadDotEnv(file: string) {
  try {
    const raw = readFileSync(resolve(process.cwd(), file), "utf8");
    for (const line of raw.split("\n")) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const [, k, rawV] = m;
      if (process.env[k]) continue;
      process.env[k] = rawV.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
    }
  } catch {}
}
loadDotEnv(".env.local");
loadDotEnv(".env");

import { prisma } from "../src/lib/prisma";
import { executeRemediation } from "../src/lib/remediation/executor";

async function main() {
  const target = await prisma.plant.findFirst({
    where: { code: "TR-0205" }, // Planta Postobón Yumbo (Deye)
    include: { devices: { include: { provider: true }, take: 1 } },
  });
  if (!target || !target.devices[0]) {
    console.error("✗ No se encontró una planta Deye del seed. Corre `npm run db:seed` primero.");
    process.exit(1);
  }
  const device = target.devices[0];
  console.log(`→ Forzando alarma low_gen en ${target.name} (${device.provider.slug}/${device.externalId})`);

  // Cierra intentos previos (misma alarma) para que el cooldown no la frene
  await prisma.remediationAction.deleteMany({
    where: { deviceId: device.id, actionType: "restart_inverter" },
  });

  const existing = await prisma.alarm.findFirst({
    where: { deviceId: device.id, type: "low_gen", resolvedAt: null },
  });
  const alarm = existing
    ? await prisma.alarm.update({
        where: { id: existing.id },
        data: {
          severity: "warning",
          message: "Generación 38% bajo expectativa vs. irradiancia",
          requiresHuman: false,
        },
      })
    : await prisma.alarm.create({
        data: {
          deviceId: device.id,
          severity: "warning",
          type: "low_gen",
          message: "Generación 38% bajo expectativa vs. irradiancia",
          aiSuggestion:
            "Probable desconexión MPPT2 por alerta térmica; el agente puede reiniciar el inversor.",
        },
      });
  console.log(`  · alarma id=${alarm.id}`);

  const result = await executeRemediation(alarm.id, "manual");
  console.log(`→ Resultado: ${result.status} (mode=${result.mode}) — ${result.reason}`);
  if (result.plan) {
    console.log("\n Petición simulada que se enviaría al middleware:");
    console.log(JSON.stringify(result.plan, null, 2));
  }
  console.log(`\n✓ Abre http://localhost:3000/auto-reparacion para ver la acción.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
