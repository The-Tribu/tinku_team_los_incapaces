/**
 * In-memory store shared between the landing page push endpoint and the scraper.
 * Holds the latest reading per station exactly as the landing page is displaying it.
 * Module-level singleton — valid for dev and single-process prod deployments.
 */
import type { DeyeDemoReading } from "./deye-sim";

interface StationSnapshot {
  reading: DeyeDemoReading;
  receivedAt: number; // Date.now() when the landing last pushed
}

// Global map: stationId → latest snapshot
const store = new Map<string, StationSnapshot>();

export function pushSnapshot(reading: DeyeDemoReading): void {
  store.set(reading.stationId, { reading, receivedAt: Date.now() });
}

export function getSnapshot(stationId: string): StationSnapshot | undefined {
  return store.get(stationId);
}

export function getAllSnapshots(): StationSnapshot[] {
  return Array.from(store.values());
}

/** Returns true if the snapshot is considered stale (older than maxAgeMs). */
export function isStale(snapshot: StationSnapshot, maxAgeMs = 15_000): boolean {
  return Date.now() - snapshot.receivedAt > maxAgeMs;
}
