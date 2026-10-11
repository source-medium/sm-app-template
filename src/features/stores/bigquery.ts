import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { StoreAccessError } from "@/lib/auth/store-access";
import { loadStores } from "@/lib/data/stores.server";
import { MAX_STORES } from "@/lib/data/store-roster.server";
import { decodeRows } from "@/lib/data/decode";
import { periodParams, periodSql } from "@/lib/data/period-sql";
import type { DateRange } from "@/lib/filters";
import { STORES_RELATION, StoreSummaryRow } from "./rows";

/** One bounded query for the canonical roster, not one job per store. Never accepts browser-supplied IDs. */
export async function queryStoreComparison(range: DateRange, baseline: DateRange | null) {
  const access = await requireViewer({ live: true });
  if (access.storeId !== null) throw new StoreAccessError();
  const stores = await loadStores();
  if (!stores.length) return { stores, rows: [] };
  const { warehouse } = access;
  const period = periodSql("date");
  const result = await warehouse.query({
    name: "store_comparison",
    maxRows: MAX_STORES,
    sql: `WITH stores AS (
      SELECT sm_store_id,
        ${period.sum("order_net_revenue", "revenue")},
        ${period.sum("order_count", "orders")},
        ${period.sum("ad_spend", "spend")},
        ${period.latest}
      FROM ${warehouse.table(STORES_RELATION)}
      WHERE sm_store_id IN UNNEST(JSON_VALUE_ARRAY(@store_ids)) AND ${period.rows}
      GROUP BY sm_store_id
    )
    SELECT * EXCEPT (group_latest_date, group_previous_latest_date),
      group_latest_date AS latest_date, group_previous_latest_date AS previous_latest_date
    FROM stores ORDER BY sm_store_id`,
    params: [
      { name: "store_ids", type: "STRING", value: JSON.stringify(stores.map((store) => store.id)) },
      ...periodParams(range, baseline),
    ],
  });
  return { stores, rows: decodeRows(StoreSummaryRow, result.rows, STORES_RELATION) };
}
