/**
 * SunHub · Baselines rolling por device+métrica.
 *
 * Los baselines se recalculan nightly (ver scripts/update-baselines.ts). El
 * detector de anomalías consulta la versión persistida en vez de recalcular
 * cada tick. Si un device aún no tiene baseline (hackathon recién arrancado),
 * `ensureSeededBaselines()` genera uno sintético desde las últimas N lecturas
 * para que el demo muestre el flujo completo desde el día 1.
 */
import { prisma } from "./prisma";

export type BaselineMetric = "power_ac_kw" | "voltage_v" | "temperature_c";

const METRIC_COLUMNS: Record<BaselineMetric, string> = {
  power_ac_kw: "power_ac_kw",
  voltage_v: "voltage_v",
  temperature_c: "temperature_c",
};

export type Baseline = {
  deviceId: string;
  metric: BaselineMetric;
  mean: number;
  stddev: number;
  p05: number | null;
  p50: number | null;
  p95: number | null;
  sampleSize: number;
  updatedAt: Date;
};

export async function loadBaseline(
  deviceId: string,
  metric: BaselineMetric,
  windowDays = 30,
): Promise<Baseline | null> {
  const row = await prisma.deviceBaseline.findUnique({
    where: { deviceId_metric_windowDays: { deviceId, metric, windowDays } },
  });
  if (!row) return null;
  return {
    deviceId: row.deviceId,
    metric: row.metric as BaselineMetric,
    mean: Number(row.mean),
    stddev: Number(row.stddev),
    p05: row.p05 ? Number(row.p05) : null,
    p50: row.p50 ? Number(row.p50) : null,
    p95: row.p95 ? Number(row.p95) : null,
    sampleSize: row.sampleSize,
    updatedAt: row.updatedAt,
  };
}

/** Calcula stats desde raw SQL para no cargar todas las lecturas a memoria. */
async function computeStats(
  deviceId: string,
  metric: BaselineMetric,
  windowDays: number,
): Promise<{ mean: number; stddev: number; p05: number; p50: number; p95: number; n: number } | null> {
  const since = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000);
  const col = METRIC_COLUMNS[metric];
  // $queryRawUnsafe porque el nombre de columna viene de un switch whitelisted.
  const rows = await prisma.$queryRawUnsafe<
    Array<{ mean: number; stddev: number; p05: number; p50: number; p95: number; n: number }>
  >(
    `
      SELECT
        COALESCE(AVG(${col})::float, 0)                                     AS mean,
        COALESCE(STDDEV_SAMP(${col})::float, 0)                             AS stddev,
        COALESCE(percentile_cont(0.05) WITHIN GROUP (ORDER BY ${col})::float, 0) AS p05,
        COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY ${col})::float, 0) AS p50,
        COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY ${col})::float, 0) AS p95,
        COUNT(*)::int                                                        AS n
      FROM readings
      WHERE device_id = $1::uuid AND ts >= $2 AND ${col} IS NOT NULL
    `,
    deviceId,
    since,
  );
  const r = rows[0];
  if (!r || r.n < 10) return null;
  return r;
}

export async function upsertBaseline(
  deviceId: string,
  metric: BaselineMetric,
  windowDays = 30,
): Promise<Baseline | null> {
  const stats = await computeStats(deviceId, metric, windowDays);
  if (!stats) return null;
  const row = await prisma.deviceBaseline.upsert({
    where: { deviceId_metric_windowDays: { deviceId, metric, windowDays } },
    create: {
      deviceId,
      metric,
      windowDays,
      sampleSize: stats.n,
      mean: stats.mean,
      stddev: stats.stddev,
      p05: stats.p05,
      p50: stats.p50,
      p95: stats.p95,
    },
    update: {
      sampleSize: stats.n,
      mean: stats.mean,
      stddev: stats.stddev,
      p05: stats.p05,
      p50: stats.p50,
      p95: stats.p95,
    },
  });
  return {
    deviceId: row.deviceId,
    metric: row.metric as BaselineMetric,
    mean: Number(row.mean),
    stddev: Number(row.stddev),
    p05: row.p05 ? Number(row.p05) : null,
    p50: row.p50 ? Number(row.p50) : null,
    p95: row.p95 ? Number(row.p95) : null,
    sampleSize: row.sampleSize,
    updatedAt: row.updatedAt,
  };
}

/** Refresca baselines para TODOS los devices. Se corre nightly. */
export async function refreshAllBaselines() {
  const devices = await prisma.device.findMany({ select: { id: true } });
  const metrics: BaselineMetric[] = ["power_ac_kw", "voltage_v", "temperature_c"];
  let updated = 0;
  let skipped = 0;
  for (const d of devices) {
    for (const m of metrics) {
      const res = await upsertBaseline(d.id, m, 30);
      if (res) updated++;
      else skipped++;
    }
  }
  return { devices: devices.length, updated, skipped };
}

/**
 * z-score vs baseline. Retorna null si no hay baseline o stddev=0.
 * Valor positivo = por encima de la media; negativo = por debajo.
 */
export function zScore(value: number, baseline: Baseline | null): number | null {
  if (!baseline || baseline.stddev === 0) return null;
  return (value - baseline.mean) / baseline.stddev;
}

/**
 * Clasifica un z-score en severity para el bus de anomalías.
 * |z| > 3 critical, > 2 warning, > 1.5 info, else null (no-op).
 */
export function anomalySeverity(z: number | null): "critical" | "warning" | "info" | null {
  if (z === null) return null;
  const abs = Math.abs(z);
  if (abs > 3) return "critical";
  if (abs > 2) return "warning";
  if (abs > 1.5) return "info";
  return null;
}
