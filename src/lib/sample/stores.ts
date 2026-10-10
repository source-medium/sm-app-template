/**
 * The synthetic stores every sample view shares. Two stores, so the picker
 * and the "no cross-store totals" rule are exercised from the first run, in
 * different time zones, as dim_stores would publish them. Both use USD, the
 * same way store_currency_code labels every money column for a store.
 */
export const SAMPLE_STORES = [
  {
    id: "sample-store-a",
    label: "Sample Store A",
    brand: "Sample Brand",
    timeZone: "America/New_York",
    currency: "USD",
  },
  {
    id: "sample-store-b",
    label: "Sample Store B",
    brand: "Sample Brand",
    timeZone: "America/Los_Angeles",
    currency: "USD",
  },
] as const;

/** Per-store scale so the two stores look different. */
export const SAMPLE_STORE_SCALE: ReadonlyMap<string, number> = new Map([
  ["sample-store-a", 1],
  ["sample-store-b", 0.35],
]);
