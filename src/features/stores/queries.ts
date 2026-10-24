import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { StoreAccessError } from "@/lib/auth/store-access";
import { loadStores, reportingCurrency, type StoreOption } from "@/lib/data/stores.server";
import type { DateRange } from "@/lib/filters";
import type { StoreSummary } from "./rows";
import { queryStoreComparison } from "./bigquery";
import { sampleStoreComparison } from "./sample";
import type { BaselineRanges } from "@/lib/comparison";

export type StoreComparison = { store: StoreOption; currency: string | null; summary: StoreSummary | null };

/** A portfolio is available only to viewers of an unrestricted deployment. */
export async function getStoreComparison(range: DateRange, baselines: BaselineRanges): Promise<StoreComparison[]> {
  const access = await requireViewer();
  if (access.storeId !== null) throw new StoreAccessError();
  const { stores, rows } =
    access.mode === "live"
      ? await queryStoreComparison(range, baselines)
      : await loadStores().then((stores) => ({ stores, rows: sampleStoreComparison(stores, range, baselines) }));
  const summaries = new Map(rows.map((row) => [row.sm_store_id, row]));
  return stores.map((store) => ({
    store,
    currency: reportingCurrency(store, access),
    summary: summaries.get(store.id) ?? null,
  }));
}
