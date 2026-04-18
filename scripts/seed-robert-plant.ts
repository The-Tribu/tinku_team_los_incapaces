#!/usr/bin/env tsx
/**
 * Seed de planta de prueba end-to-end: "Planta Robert" (TR-001).
 *
 * Deja todo listo para recorrer SunHub con datos realistas sin depender de
 * que el middleware del hackathon esté despierto:
 *   - Cliente + Planta + Device (provider=deye para compatibilidad de comandos)
 *   - 7 días de lecturas (cada 15 min) con curva diurna → dashboards populados
 *   - Baselines calculados desde esas lecturas → z-score listo
 *   - PlantAutomationPolicy en modo `approval + mock` con todos los comandos
 *   - Contract del mes actual con metas razonables
 *   - 3 Predictions (abierta, confirmada, descartada) para probar feedback
 *   - 2 Remediations (propuesta + ejecutada/verificada) para el audit log
 *
 * Uso:
 *   npm run seed:robert            # idempotente, se puede correr varias veces
 *   npm run seed:robert -- --reset # borra datos previos de esta planta antes
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
import type { Prisma } from "@prisma/client";

const PLANT_CODE = "TR-001";
const PLANT_NAME = "Planta Robert";
const CLIENT_NAME = "Cliente Robert · Demo";
const DEVICE_EXTERNAL_ID = "ROBERT-INV-001";
const CAPACITY_KWP = 150;
const LAT = 4.6533;
const LNG = -74.0836;
const LOCATION = "Bogotá, Cundinamarca";

function dayOfYearFraction(d: Date): number {
  // aproximación de estacionalidad (±5% sobre el pico).
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d.getTime() - start.getTime();
  return (diff / (1000 * 60 * 60 * 24)) / 365;
}

function solarProfileKw(ts: Date, capacityKwp: number): number {
  const hour = ts.getUTCHours() - 5 + (ts.getUTCMinutes() / 60); // hora local Bogotá
  const sunrise = 6;
  const sunset = 18;
  if (hour < sunrise || hour > sunset) return 0;
  const phase = ((hour - sunrise) / (sunset - sunrise)) * Math.PI;
  const base = Math.sin(phase);
  // pequeño jitter + variación estacional
  const season = 1 + 0.05 * Math.sin(dayOfYearFraction(ts) * Math.PI * 2);
  const jitter = 1 + (Math.random() - 0.5) * 0.08;
  return Math.max(0, capacityKwp * 0.82 * base * season * jitter);
}

function temperatureC(ts: Date, powerKw: number, capacityKwp: number): number {
  const ambient = 18 + 6 * Math.sin(((ts.getUTCHours() - 12) * Math.PI) / 12);
  return ambient + (powerKw / capacityKwp) * 22 + (Math.random() - 0.5) * 1.5;
}

async function upsertProvider() {
  const existing = await prisma.provider.findUnique({ where: { slug: "deye" } });
  if (existing) return existing;
  return prisma.provider.create({
    data: { slug: "deye", displayName: "DeyeCloud" },
  });
}

async function upsertClient() {
  const existing = await prisma.client.findFirst({ where: { name: CLIENT_NAME } });
  if (existing) return existing;
  return prisma.client.create({
    data: {
      name: CLIENT_NAME,
      contactEmail: "robertsty99@gmail.com",
      region: "Cundinamarca",
    },
  });
}

async function upsertPlant(clientId: string) {
  const existing = await prisma.plant.findUnique({ where: { code: PLANT_CODE } });
  const data = {
    clientId,
    code: PLANT_CODE,
    name: PLANT_NAME,
    location: LOCATION,
    lat: LAT,
    lng: LNG,
    capacityKwp: CAPACITY_KWP,
    contractType: "PPA",
    contractEnd: new Date("2027-12-31"),
  };
  if (existing) {
    return prisma.plant.update({ where: { id: existing.id }, data });
  }
  return prisma.plant.create({ data });
}

async function upsertDevice(plantId: string, providerId: string) {
  const existing = await prisma.device.findUnique({
    where: { providerId_externalId: { providerId, externalId: DEVICE_EXTERNAL_ID } },
  });
  if (existing) {
    return prisma.device.update({
      where: { id: existing.id },
      data: { plantId, kind: "inverter", currentStatus: "online", lastSeenAt: new Date() },
    });
  }
  return prisma.device.create({
    data: {
      plantId,
      providerId,
      externalId: DEVICE_EXTERNAL_ID,
      kind: "inverter",
      model: "Deye SUN-150K (demo)",
      installedAt: new Date("2025-01-15"),
      currentStatus: "online",
      lastSeenAt: new Date(),
    },
  });
}

async function seedReadings(deviceId: string, days: number) {
  // Evita duplicar si ya hay lecturas recientes.
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const count = await prisma.reading.count({ where: { deviceId, ts: { gte: since } } });
  if (count > 100) {
    console.log(`  · readings ya presentes (${count}) — saltando generación`);
    return count;
  }
  const batch: Prisma.ReadingCreateManyInput[] = [];
  const stepMinutes = 15;
  const now = new Date();
  let energyAccumulator = 0;
  for (let t = since.getTime(); t <= now.getTime(); t += stepMinutes * 60 * 1000) {
    const ts = new Date(t);
    const powerKw = solarProfileKw(ts, CAPACITY_KWP);
    const temp = temperatureC(ts, powerKw, CAPACITY_KWP);
    const voltage = 220 + (Math.random() - 0.5) * 6;
    const frequency = 60 + (Math.random() - 0.5) * 0.3;
    const currentA = powerKw > 0 ? (powerKw * 1000) / voltage : 0;
    energyAccumulator += (powerKw * stepMinutes) / 60;
    batch.push({
      deviceId,
      ts,
      powerAcKw: powerKw.toFixed(3),
      voltageV: voltage.toFixed(2),
      currentA: currentA.toFixed(2),
      frequencyHz: frequency.toFixed(2),
      powerFactor: (0.96 + Math.random() * 0.03).toFixed(3),
      temperatureC: temp.toFixed(2),
      energyKwh: energyAccumulator.toFixed(3),
      raw: { synthetic: true, seeded: "robert" },
    });
  }
  // Insertar en chunks para no saturar.
  const chunk = 200;
  for (let i = 0; i < batch.length; i += chunk) {
    await prisma.reading.createMany({ data: batch.slice(i, i + chunk) });
  }
  return batch.length;
}

async function recomputeBaselines(deviceId: string) {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const metrics: Array<"power_ac_kw" | "voltage_v" | "temperature_c"> = [
    "power_ac_kw",
    "voltage_v",
    "temperature_c",
  ];
  const rows = await prisma.reading.findMany({
    where: { deviceId, ts: { gte: since } },
    select: {
      powerAcKw: true,
      voltageV: true,
      temperatureC: true,
    },
  });
  if (rows.length < 10) return 0;
  let upserted = 0;
  for (const metric of metrics) {
    const values: number[] = [];
    for (const r of rows) {
      const v =
        metric === "power_ac_kw"
          ? r.powerAcKw
          : metric === "voltage_v"
            ? r.voltageV
            : r.temperatureC;
      if (v !== null && v !== undefined) {
        const n = Number(v);
        if (Number.isFinite(n) && (metric !== "power_ac_kw" || n > 0.01)) values.push(n);
      }
    }
    if (values.length < 10) continue;
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const variance = values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);
    const sorted = values.slice().sort((a, b) => a - b);
    const pct = (p: number) => sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
    await prisma.deviceBaseline.upsert({
      where: { deviceId_metric_windowDays: { deviceId, metric, windowDays: 30 } },
      create: {
        deviceId,
        metric,
        windowDays: 30,
        sampleSize: values.length,
        mean: mean.toFixed(4),
        stddev: stddev.toFixed(4),
        p05: pct(0.05).toFixed(4),
        p50: pct(0.5).toFixed(4),
        p95: pct(0.95).toFixed(4),
      },
      update: {
        sampleSize: values.length,
        mean: mean.toFixed(4),
        stddev: stddev.toFixed(4),
        p05: pct(0.05).toFixed(4),
        p50: pct(0.5).toFixed(4),
        p95: pct(0.95).toFixed(4),
      },
    });
    upserted++;
  }
  return upserted;
}

async function upsertPolicy(plantId: string) {
  const existing = await prisma.plantAutomationPolicy.findUnique({ where: { plantId } });
  const data = {
    plantId,
    autonomyLevel: "approval",
    executionMode: "mock",
    allowedCommands: [
      "restart_inverter",
      "clear_fault",
      "set_work_mode_battery_first",
      "set_work_mode_grid_first",
    ],
    requiredApproverRole: "ops",
    maxActionsPerDay: 20,
    notes: "Planta demo Robert — todo en mock, aprobación ops.",
  };
  if (existing) return prisma.plantAutomationPolicy.update({ where: { plantId }, data });
  return prisma.plantAutomationPolicy.create({ data });
}

async function upsertContract(plantId: string) {
  const periodMonth = new Date();
  periodMonth.setDate(1);
  periodMonth.setHours(0, 0, 0, 0);
  return prisma.contract.upsert({
    where: { plantId_periodMonth: { plantId, periodMonth } },
    update: {},
    create: {
      plantId,
      periodMonth,
      targetEnergyKwh: CAPACITY_KWP * 5 * 30, // 5 kWh/kWp/día
      targetSavingsCop: CAPACITY_KWP * 5 * 30 * 600,
      targetUptimePct: 97,
      targetPrPct: 82,
      targetCo2Ton: (CAPACITY_KWP * 5 * 30 * 0.164) / 1000,
      penaltyPerBreach: 2_000_000,
    },
  });
}

async function seedPredictions(deviceId: string) {
  // Borra las predicciones previas de este device para mantener estado limpio.
  await prisma.prediction.deleteMany({ where: { deviceId } });
  const now = Date.now();
  const created = await prisma.$transaction(async (tx) => {
    const open = await tx.prediction.create({
      data: {
        deviceId,
        predictedType: "degradation",
        probability: "0.640",
        daysToEvent: "5.00",
        confidence: "0.720",
        rootCause: "Tendencia de temperatura por encima del p95 histórico del inversor.",
        suggestedAction: "Revisar ventilación y limpieza de disipadores antes del próximo ciclo de carga pico.",
        modelVersion: "heuristic-v2+rag+minimax",
        triggerKind: "anomaly",
        generatedAt: new Date(now - 2 * 60 * 60 * 1000),
      },
    });
    const confirmed = await tx.prediction.create({
      data: {
        deviceId,
        predictedType: "failure",
        probability: "0.780",
        daysToEvent: "1.50",
        confidence: "0.810",
        rootCause: "Caídas repetidas de voltaje detectadas en la última semana.",
        suggestedAction: "Ejecutar clear_fault y monitorear el rebote.",
        modelVersion: "heuristic-v2+rag+minimax",
        triggerKind: "scheduled",
        generatedAt: new Date(now - 3 * 24 * 60 * 60 * 1000),
      },
    });
    await tx.predictionOutcome.create({
      data: {
        predictionId: confirmed.id,
        status: "confirmed",
        actualEventAt: new Date(now - 2 * 24 * 60 * 60 * 1000),
        notes: "Operador confirmó falla de voltaje; acción ejecutada OK.",
      },
    });
    const dismissed = await tx.prediction.create({
      data: {
        deviceId,
        predictedType: "low_gen",
        probability: "0.530",
        daysToEvent: "7.00",
        confidence: "0.480",
        rootCause: "Pronóstico inicial de nubosidad alta — reversado por forecast actualizado.",
        suggestedAction: "Monitorear sin intervenir.",
        modelVersion: "heuristic-v2+rag+minimax",
        triggerKind: "scheduled",
        generatedAt: new Date(now - 5 * 24 * 60 * 60 * 1000),
      },
    });
    await tx.predictionOutcome.create({
      data: {
        predictionId: dismissed.id,
        status: "dismissed",
        notes: "Falso positivo — nubosidad fue menor a la esperada.",
      },
    });
    return { open, confirmed, dismissed };
  });
  return created;
}

async function seedRemediations(
  plantId: string,
  deviceId: string,
  openPredictionId: string,
  confirmedPredictionId: string,
) {
  await prisma.remediationAudit.deleteMany({
    where: { remediation: { plantId } },
  });
  await prisma.remediation.deleteMany({ where: { plantId } });
  const now = new Date();

  // Remediación 1: propuesta, esperando aprobación (atada a la predicción abierta)
  const proposed = await prisma.remediation.create({
    data: {
      plantId,
      deviceId,
      predictionId: openPredictionId,
      commandType: "clear_fault",
      commandPayload: {
        deviceSn: DEVICE_EXTERNAL_ID,
        orderType: "CLEAR_FAULT",
        params: {},
      },
      reason: "Predicción de degradación por temperatura — clear_fault preventivo.",
      status: "proposed",
      executionMode: "mock",
      proposedBy: "ai",
      proposedAt: new Date(now.getTime() - 30 * 60 * 1000),
    },
  });
  await prisma.remediationAudit.create({
    data: {
      remediationId: proposed.id,
      event: "proposed",
      actorKind: "ai",
      payload: { source: "prediction", predictionId: openPredictionId },
    },
  });

  // Remediación 2: ciclo completo proposed → approved → executed → verified (historia)
  const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
  const executed = await prisma.remediation.create({
    data: {
      plantId,
      deviceId,
      predictionId: confirmedPredictionId,
      commandType: "clear_fault",
      commandPayload: {
        deviceSn: DEVICE_EXTERNAL_ID,
        orderType: "CLEAR_FAULT",
        params: {},
      },
      reason: "Alarma de voltaje confirmada — clear_fault aplicado en ventana oportuna.",
      status: "verified",
      executionMode: "mock",
      proposedBy: "ai",
      proposedAt: past,
      approvedAt: new Date(past.getTime() + 10 * 60 * 1000),
      executedAt: new Date(past.getTime() + 15 * 60 * 1000),
      providerOrderId: `mock-${past.getTime().toString(36)}`,
      executionResult: {
        simulated: true,
        message: "Ejecución simulada — no se envió comando al dispositivo.",
      },
      verifiedAt: new Date(past.getTime() + 20 * 60 * 1000),
      verifiedOutcome: "success",
    },
  });
  for (const [event, offsetMin] of [
    ["proposed", 0],
    ["approved", 10],
    ["executed", 15],
    ["verified", 20],
  ] as const) {
    await prisma.remediationAudit.create({
      data: {
        remediationId: executed.id,
        event,
        actorKind: event === "proposed" ? "ai" : "user",
        createdAt: new Date(past.getTime() + offsetMin * 60 * 1000),
      },
    });
  }

  return { proposed, executed };
}

async function maybeReset() {
  if (!process.argv.includes("--reset")) return;
  const plant = await prisma.plant.findUnique({ where: { code: PLANT_CODE } });
  if (!plant) return;
  console.log(`→ --reset: borrando datos previos de ${PLANT_CODE}…`);
  await prisma.plant.delete({ where: { id: plant.id } }); // cascade a devices/readings/etc
  const client = await prisma.client.findFirst({ where: { name: CLIENT_NAME } });
  if (client) {
    const remaining = await prisma.plant.count({ where: { clientId: client.id } });
    if (remaining === 0) await prisma.client.delete({ where: { id: client.id } });
  }
}

async function main() {
  console.log(`\n🌱 Seed: ${PLANT_NAME} (${PLANT_CODE})`);
  await maybeReset();
  const provider = await upsertProvider();
  const client = await upsertClient();
  const plant = await upsertPlant(client.id);
  const device = await upsertDevice(plant.id, provider.id);
  console.log(`  ✓ cliente=${client.name}`);
  console.log(`  ✓ planta=${plant.code} · id=${plant.id}`);
  console.log(`  ✓ device=${device.externalId} · provider=${provider.slug}`);

  const readings = await seedReadings(device.id, 7);
  console.log(`  ✓ readings generadas · ${readings} (7d · cada 15 min)`);

  const baselines = await recomputeBaselines(device.id);
  console.log(`  ✓ baselines recalculados · ${baselines} métricas`);

  const policy = await upsertPolicy(plant.id);
  console.log(`  ✓ policy · ${policy.autonomyLevel} + ${policy.executionMode} · ${policy.allowedCommands.length} comandos`);

  await upsertContract(plant.id);
  console.log(`  ✓ contrato del mes actual`);

  const preds = await seedPredictions(device.id);
  console.log(`  ✓ predicciones · open=${preds.open.id.slice(0, 8)} confirmed=${preds.confirmed.id.slice(0, 8)} dismissed=${preds.dismissed.id.slice(0, 8)}`);

  const rems = await seedRemediations(plant.id, device.id, preds.open.id, preds.confirmed.id);
  console.log(`  ✓ remediaciones · proposed=${rems.proposed.id.slice(0, 8)} verified=${rems.executed.id.slice(0, 8)}`);

  console.log(`\n🎯 Listo. Próximos pasos:`);
  console.log(`   1. npm run dev`);
  console.log(`   2. Login como admin y explorar /plantas, /predicciones, /configuracion`);
  console.log(`   3. Disparar alarma mock: POST /api/dev/mock-alarm { plantCode: "${PLANT_CODE}" }`);
  console.log(`      o desde UI: /alarmas → botón "Disparar alarma de prueba" (admin/ops)`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
