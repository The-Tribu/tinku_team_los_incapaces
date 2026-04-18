/**
 * Server-side DeyeCloud simulation engine.
 * Produces deterministic readings based on wall-clock time so every
 * consumer (API route, scraper, tests) sees identical values for the
 * same moment in time — no shared state required.
 */

export interface SimStation {
  id: string;
  name: string;
  peakKwp: number;
  lat?: number;
  lng?: number;
  region: string;      // shown in /plantas — maps to Client.region
  clientName: string;  // owner displayed in /plantas — maps to Client.name
  location: string;    // street / city address — maps to Plant.location
}

/** Full simulated reading — canonical fields + extras that go to raw. */
export interface DeyeDemoReading {
  stationId: string;
  ts: string; // ISO-8601
  // ── CanonicalReading fields ──────────────────────────────────
  power_ac_kw: number;
  voltage_v: number;      // grid voltage
  current_a: number;      // total DC current (string1 + string2)
  frequency_hz: number;
  power_factor: number;
  temperature_c: number;  // inverter temperature
  energy_kwh: number;     // today's energy
  status: "online" | "offline" | "warning" | "degraded";
  // ── Extra fields (persisted in reading.raw) ──────────────────
  power_pv_kw: number;
  grid_exchange_kw: number;   // positive = export, negative = import
  battery_soc_pct: number;
  irradiation_wm2: number;
  co2_today_kg: number;
  efficiency_pct: number;
  string1_voltage_v: number;
  string2_voltage_v: number;
  string1_current_a: number;
  string2_current_a: number;
  total_energy_kwh: number;
}

// ── Registered demo stations ──────────────────────────────────────────────────

export const DEMO_STATIONS: SimStation[] = [
  {
    id: "DEMO-DEY-40760",
    name: "Altos de Quimbaya Casa 4",
    peakKwp: 8.2,
    lat: 4.5709, lng: -74.2973,
    region: "Quindío",
    clientName: "Quimbaya Residencial S.A.S.",
    location: "Calle 12 #5-34, Armenia, Quindío",
  },
  {
    id: "DEMO-DEY-122825",
    name: "J&G Sistemas",
    peakKwp: 12.5,
    lat: 4.6097, lng: -74.0817,
    region: "Bogotá D.C.",
    clientName: "J&G Tecnología Ltda.",
    location: "Carrera 30 #45-10, Bogotá D.C.",
  },
  {
    id: "DEMO-DEY-155158",
    name: "Aicardo Industrial",
    peakKwp: 15.0,
    lat: 4.7110, lng: -74.0721,
    region: "Cundinamarca",
    clientName: "Aicardo Industrias S.A.",
    location: "Zona Industrial El Rosal, Cundinamarca",
  },
  {
    id: "DEMO-DEY-166961",
    name: "Novacams Sede 1",
    peakKwp: 10.8,
    lat: 4.8087, lng: -75.6906,
    region: "Risaralda",
    clientName: "Novacams Colombia S.A.S.",
    location: "Avenida 30 de Agosto #40-20, Pereira, Risaralda",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v));
}

/** Deterministic pseudo-random in [0,1) for a given integer seed. */
function seededRand(seed: number): number {
  const x = Math.sin(seed + 1) * 10_000;
  return x - Math.floor(x);
}

/** Solar irradiance envelope: 0 at dawn/dusk, peak at solar noon (≈13:00 local). */
function sunCurve(hour: number): number {
  if (hour < 6 || hour > 19) return 0;
  return Math.max(0, Math.sin(((hour - 6) / 13) * Math.PI));
}

/**
 * Approximate "kWh generated today" by integrating the sun curve from 06:00
 * to `hour` analytically. PR factor 0.85 applied.
 */
function energyToday(peakKwp: number, hour: number): number {
  const elapsed = clamp(hour - 6, 0, 13);
  // ∫₀^t sin((x/13)π) dx  =  (13/π)(1 − cos((t/13)π))
  const integral = (13 / Math.PI) * (1 - Math.cos((elapsed / 13) * Math.PI));
  return peakKwp * integral * 0.85;
}

// ── Server-side demo clock ────────────────────────────────────────────────────
// Maps real elapsed time → simulated solar hour so the server always cycles
// through a visible solar day regardless of actual wall clock.
//
// SIM_SPEED: simulated seconds per real second (env: NEXT_PUBLIC_DEYE_DEMO_SIM_STEP_S).
//   Default 30 → full day cycle ≈ 28 min real time.
//
// Starting hour: if real Colombia time (UTC-5) is already daytime (6-18h), use
// that hour so the sim matches reality. Otherwise start at 10:00 so values are
// immediately non-trivial (mid-morning strong sun).

const DEMO_END_HOUR   = 20;
const DEMO_SPAN_HOURS = DEMO_END_HOUR - 6; // 14 h of daylight

const SIM_SPEED =
  typeof process !== "undefined"
    ? Number(process.env.NEXT_PUBLIC_DEYE_DEMO_SIM_STEP_S ?? 30)
    : 30;

function initialSimHour(): number {
  const colHour = ((new Date().getUTCHours() - 5) + 24) % 24;
  return colHour >= 6 && colHour < 19 ? colHour : 10; // daytime → match reality; night → start at 10 AM
}

const MODULE_LOAD_MS   = Date.now();
const DEMO_START_HOUR  = initialSimHour();

/**
 * Returns a simulated solar hour in [6, 20) that advances with real elapsed
 * time at SIM_SPEED. Continuous within a server process lifetime.
 */
export function getServerSimHour(wallMs?: number): number {
  const elapsedSec  = ((wallMs ?? Date.now()) - MODULE_LOAD_MS) / 1000;
  const simHoursAdv = (elapsedSec * SIM_SPEED) / 3600;
  return 6 + ((DEMO_START_HOUR - 6 + simHoursAdv) % DEMO_SPAN_HOURS);
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * @param station     Station to simulate.
 * @param simHourOverride  Solar hour override (0-24). If omitted uses getServerSimHour().
 * @param wallMs      Real timestamp used only for the seed (jitter variation). Defaults to Date.now().
 */
export function simulateReading(
  station: SimStation,
  simHourOverride?: number,
  wallMs?: number,
): DeyeDemoReading {
  const now = wallMs ?? Date.now();
  const hour = simHourOverride ?? getServerSimHour(now);

  // Second-level seed so each scraper tick produces a distinct jitter value.
  const minuteSeed =
    Math.floor(now / 1_000) +
    station.id.split("").reduce((a, c) => a + c.charCodeAt(0), 0);

  const jr = (base: number, pct: number, offset = 0) =>
    base * (1 + (seededRand(minuteSeed + offset + Math.round(base * 100)) - 0.5) * 2 * pct);

  const sun = sunCurve(hour);
  const base = station.peakKwp * sun;

  const powerPV = clamp(jr(base * 1.08, 0.04, 1), 0, station.peakKwp * 1.1);
  const powerAC = clamp(jr(base, 0.05, 2), 0, station.peakKwp);
  const gridExchange = clamp(powerAC - jr(2.1, 0.15, 3), -4, station.peakKwp);
  const irr = clamp(jr(sun * 1020, 0.06, 4), 0, 1100);
  const temp = 35 + sun * 22 + seededRand(minuteSeed + 5) * 2;
  const eff = powerPV > 0.1 ? clamp((powerAC / powerPV) * 100, 92, 98.5) : 0;
  const powerFactor = clamp(jr(0.97, 0.01, 6), 0.92, 1.0);
  const battSOC = clamp(30 + sun * 55 + (seededRand(minuteSeed + 7) - 0.5) * 10, 20, 98);

  const string1V = clamp(jr(sun > 0.05 ? 385 : 0, 0.02, 8), 0, 480);
  const string2V = clamp(jr(sun > 0.05 ? 379 : 0, 0.02, 9), 0, 480);
  const halfPowerPV = powerPV / 2;
  const string1A = clamp(string1V > 1 ? jr(halfPowerPV / (string1V / 1000), 0.05, 10) : 0, 0, 15);
  const string2A = clamp(string2V > 1 ? jr(halfPowerPV / (string2V / 1000), 0.05, 11) : 0, 0, 15);
  const totalCurrentA = string1A + string2A;

  const gridV = clamp(jr(220, 0.005, 12), 210, 240);
  const gridHz = clamp(jr(60, 0.001, 13), 59.5, 60.5);

  const todayKwh = energyToday(station.peakKwp, hour);
  // Rough total since ~2-year commissioning
  const totalKwh = station.peakKwp * 365 * 2 * 4.5 + todayKwh;
  const co2Today = todayKwh * 0.473;

  // Within the demo cycle (always 6-20 h) power is always > 0 mid-day.
  const status: DeyeDemoReading["status"] =
    powerAC > 0.5 ? "online" : "degraded";

  return {
    stationId: station.id,
    ts: new Date(now).toISOString(), // wall clock — overridden in scraper persist

    // canonical
    power_ac_kw: powerAC,
    voltage_v: gridV,
    current_a: totalCurrentA,
    frequency_hz: gridHz,
    power_factor: powerFactor,
    temperature_c: temp,
    energy_kwh: todayKwh,
    status,
    // extra
    power_pv_kw: powerPV,
    grid_exchange_kw: gridExchange,
    battery_soc_pct: battSOC,
    irradiation_wm2: irr,
    co2_today_kg: co2Today,
    efficiency_pct: eff,
    string1_voltage_v: string1V,
    string2_voltage_v: string2V,
    string1_current_a: string1A,
    string2_current_a: string2A,
    total_energy_kwh: totalKwh,
  };
}
