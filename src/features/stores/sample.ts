import { decodeRows } from "@/lib/data/decode";
import { fromUnits } from "@/lib/data/decimal";
import type { StoreOption } from "@/lib/data/stores.server";
import type { DateRange } from "@/lib/filters";
import { countedSales, sampleSummarySource } from "@/lib/sample/executive-summary";
import { STORES_RELATION, StoreSummaryRow } from "./rows";

export function sampleStoreComparison(
  stores: StoreOption[],
  range: DateRange,
  baseline: DateRange | null,
  today?: string,
) {
  function totals(storeId: string, period: DateRange | null) {
    const rows = period ? sampleSummarySource(storeId, period, today).map(countedSales) : [];
    return {
      revenue: rows.length
        ? fromUnits(rows.reduce((sum, row) => sum + row.order_net_revenue_cents, 0n) * 10_000_000n)
        : null,
      orders: rows.length ? String(rows.reduce((sum, row) => sum + row.order_count, 0)) : null,
      spend: rows.length ? fromUnits(rows.reduce((sum, row) => sum + row.ad_spend_cents, 0n) * 10_000_000n) : null,
      latest: rows.at(-1)?.date ?? null,
    };
  }
  return decodeRows(
    StoreSummaryRow,
    stores.map((store) => {
      const current = totals(store.id, range);
      const previous = totals(store.id, baseline);
      return {
        sm_store_id: store.id,
        revenue: current.revenue,
        orders: current.orders,
        spend: current.spend,
        previous_revenue: previous.revenue,
        previous_orders: previous.orders,
        previous_spend: previous.spend,
        latest_date: current.latest,
        previous_latest_date: previous.latest,
      };
    }),
    STORES_RELATION,
  );
}
