/**
 * The synthetic stores every sample view shares. Two stores, so the picker
 * and the "no cross-store totals" rule are exercised from the first run.
 */
export const SAMPLE_STORES = [
  { id: "sample-store-a", label: "Sample Store A" },
  { id: "sample-store-b", label: "Sample Store B" },
] as const;

export type SampleStoreId = (typeof SAMPLE_STORES)[number]["id"];

/** Per-store scale so the two stores look different. */
export const SAMPLE_STORE_SCALE: Record<string, number> = {
  "sample-store-a": 1,
  "sample-store-b": 0.35,
};
