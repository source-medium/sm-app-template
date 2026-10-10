/**
 * The synthetic stores every sample view shares. Two stores, so the picker
 * and the "no cross-store totals" rule are exercised from the first run, in
 * different time zones, as dim_stores.store_timezone would publish them.
 */
export const SAMPLE_STORES = [
  { id: "sample-store-a", label: "Sample Store A", brand: "Sample Brand", timeZone: "America/New_York" },
  { id: "sample-store-b", label: "Sample Store B", brand: "Sample Brand", timeZone: "America/Los_Angeles" },
] as const;

/** Per-store scale so the two stores look different. */
export const SAMPLE_STORE_SCALE: ReadonlyMap<string, number> = new Map([
  ["sample-store-a", 1],
  ["sample-store-b", 0.35],
]);
