/**
 * In-process token bucket for the middleware rate budget.
 *
 * Provider Hub allows 60 req/min per team key. We reserve a configurable slice
 * for remediation (default 30 req/min) so that ingest polling is never starved.
 * This is intentionally lightweight (single-process only); good enough for the
 * MVP while still visible in the remediation logs when it trips.
 */
const BUDGET = Number(process.env.REMEDIATION_RATE_BUDGET ?? 30);
const WINDOW_MS = 60_000;

const hits: number[] = [];

export function tryConsume(n = 1): boolean {
  const now = Date.now();
  while (hits.length && hits[0] < now - WINDOW_MS) hits.shift();
  if (hits.length + n > BUDGET) return false;
  for (let i = 0; i < n; i++) hits.push(now);
  return true;
}

export function currentUsage(): { used: number; budget: number; windowMs: number } {
  const now = Date.now();
  while (hits.length && hits[0] < now - WINDOW_MS) hits.shift();
  return { used: hits.length, budget: BUDGET, windowMs: WINDOW_MS };
}
