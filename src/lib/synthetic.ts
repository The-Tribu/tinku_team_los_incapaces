/**
 * Synthetic reading generator.
 *
 * The hackathon middleware currently returns Growatt / Deye payloads in an
 * encrypted wire format (AES-ish; not HTTP compression), so during
 * development we fall back to a physics-ish synthetic generator so the UI,
 * rules engine and copilot have realistic data to reason over.
 *
 * The model is simple: peak at solar noon (≈12:30 local CO), zero outside
 * sunrise/sunset, a capacity-scaled magnitude, plus per-device jitter.
 * Status derives from a faked fault injection seeded by device id.
 */
import type { CanonicalReading, DeviceStatus } from "./normalize";

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}

function seededRandom(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

export type SyntheticInput = {
  externalId: string;
  capacityKwp: number;
  forcedStatus?: DeviceStatus; // allow seed to override
  now?: Date;
};

export function syntheticReading({
  externalId,
  capacityKwp,
  forcedStatus,
  now = new Date(),
}: SyntheticInput): CanonicalReading {
  const rand = seededRandom(hash(externalId) ^ (now.getUTCFullYear() * 365 + now.getUTCMonth() * 31 + now.getUTCDate()));

  // Colombia is UTC-5 year-round.
  const localHour = ((now.getUTCHours() - 5 + 24) % 24) + now.getUTCMinutes() / 60;
  // Bell curve around 12.5h, half-width ~6h.
  const daylight = Math.max(0, Math.cos(((localHour - 12.5) / 6) * (Math.PI / 2)));
  const sunFactor = daylight * daylight; // squared for sharper peak

  // Cloud cover jitter, 0.75–1.0
  const weather = 0.75 + rand() * 0.25;

  const basePower = capacityKwp * sunFactor * weather;
  const jitter = (rand() - 0.5) * capacityKwp * 0.05;
  const powerKw = Math.max(0, Number((basePower + jitter).toFixed(2)));

  // Status with very low failure probability, or honour forced value
  let status: DeviceStatus = forcedStatus ?? "online";
  if (!forcedStatus) {
    if (powerKw === 0 && sunFactor > 0.2) status = "warning";
    if (rand() < 0.02) status = "degraded";
  }
  if (status === "offline") {
    return {
      device_external_id: externalId,
      power_ac_kw: 0,
      status,
      ts: now.toISOString(),
    };
  }

  // Today's accumulated energy ≈ capacity * 4.2 * daylight-fraction-so-far
  const dayProgress = Math.min(1, localHour / 18);
  const energyKwh = Number((capacityKwp * 4.2 * dayProgress * weather).toFixed(2));

  return {
    device_external_id: externalId,
    power_ac_kw: powerKw,
    voltage_v: Number((220 + (rand() - 0.5) * 6).toFixed(1)),
    current_a: Number((powerKw > 0 ? (powerKw * 1000) / 220 : 0).toFixed(1)),
    frequency_hz: Number((60 + (rand() - 0.5) * 0.2).toFixed(2)),
    power_factor: Number((0.95 + rand() * 0.04).toFixed(3)),
    temperature_c: Number((28 + sunFactor * 15 + (rand() - 0.5) * 2).toFixed(1)),
    energy_kwh: energyKwh,
    status,
    ts: now.toISOString(),
  };
}
