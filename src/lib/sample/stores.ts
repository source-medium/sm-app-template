/**
 * The synthetic stores every sample view shares. Two stores, so the picker
 * and the "no cross-store totals" rule are exercised from the first run, in
 * different time zones, as dim_stores would publish them. Both use USD, the
 * sample report currency independently of the live deployment's settings.
 */
export const SAMPLE_STORES = [
  {
    id: "sample-store-a",
    label: "Sample Store A",
    domain: "a.example.com",
    logoUrl: "/sample-stores/store-a.svg",
    brand: "Sample Brand",
    timeZone: "America/New_York",
    currency: "USD",
  },
  {
    id: "sample-store-b",
    label: "Sample Store B",
    domain: "b.example.com",
    logoUrl: "/sample-stores/store-b.svg",
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
