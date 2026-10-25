/**
 * Store zones and currencies this server has resolved, keyed by app and store.
 * These are store configuration, not viewer data. Reusing them for an hour
 * lets a report whose link names its store start its queries without waiting
 * for the store list, while a changed zone, currency or daylight-saving change
 * in an order offset still applies within the hour, and Refresh data rereads
 * them (src/lib/data/stores.server.ts). The roster and offset queries
 * themselves go through the query cache (CACHE_POLICY.roster and storeTimeZone).
 */
import "server-only";
import { CACHE_POLICY } from "./query-cache";

/** A store's time zone and its dim_stores currency, read together. */
export type StoreFacts = { zone: string; currency: string | null };

const known = new Map<string, StoreFacts & { until: number }>();
const REMEMBER_MS = CACHE_POLICY.storeTimeZone.maxAgeSeconds * 1000;

/** The facts remembered under `key`, or null once they expire. */
export function recallStoreFacts(key: string): StoreFacts | null {
  const found = known.get(key);
  return found && found.until > Date.now() ? { zone: found.zone, currency: found.currency } : null;
}

export function rememberStoreFacts(key: string, facts: StoreFacts): void {
  known.set(key, { ...facts, until: Date.now() + REMEMBER_MS });
}

/** Test seam: forget every remembered store zone and currency. */
export function resetStoreFacts(): void {
  known.clear();
}
