/**
 * The synthetic stores every sample view shares. Two stores, so the picker
 * and the "no cross-store totals" rule are exercised from the first run.
 */
export const SAMPLE_STORES = [
  { id: "sample-store-a", label: "Sample Store A", brand: "Sample Brand" },
  { id: "sample-store-b", label: "Sample Store B", brand: "Sample Brand" },
] as const;

/** Per-store scale so the two stores look different. */
export const SAMPLE_STORE_SCALE: ReadonlyMap<string, number> = new Map([
  ["sample-store-a", 1],
  ["sample-store-b", 0.35],
]);
