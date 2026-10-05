/**
 * Overview, live. One query aggregates the store's channel and sub-channel
 * rows to daily totals and computes the period totals in the same pass, so
 * totals are never computed from a truncated list.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import { WarehouseError } from "@/lib/data/warehouse-error";
import type { ReportFilters } from "@/lib/filters";
import type { OverviewData } from "./queries";
import { OVERVIEW_RELATION, OverviewRow, toOverviewData } from "./rows";

/** The maximum range is 90 days; anything past this bound is an error, not a shorter answer. */
const MAX_ROWS = 100;

export async function queryOverview(filters: ReportFilters): Promise<OverviewData> {
  const { warehouse } = await requireViewer({ live: true });
  const result = await warehouse.query({
    name: "overview_daily",
    maxRows: MAX_ROWS,
    sql: `
      WITH daily AS (
        SELECT
          date,
          SUM(order_net_revenue) AS net_revenue,
          SUM(order_count) AS order_count,
          SUM(website_sessions) AS website_sessions,
          SUM(ad_clicks) AS ad_clicks,
          SUM(ad_spend) AS ad_spend
        FROM ${warehouse.table(OVERVIEW_RELATION)}
        WHERE sm_store_id = @store_id
          AND date BETWEEN @start_date AND @end_date
        GROUP BY date
      )
      SELECT
        date,
        net_revenue,
        order_count,
        website_sessions,
        ad_clicks,
        ad_spend,
        SUM(net_revenue) OVER () AS total_net_revenue,
        SUM(order_count) OVER () AS total_order_count,
        SUM(website_sessions) OVER () AS total_website_sessions,
        SUM(ad_clicks) OVER () AS total_ad_clicks,
        SUM(ad_spend) OVER () AS total_ad_spend
      FROM daily
      ORDER BY date`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
    ],
  });
  if (result.truncated) throw new WarehouseError("result_too_large", { reason: "overview_daily" });
  return toOverviewData(decodeRows(OverviewRow, result.rows, OVERVIEW_RELATION));
}
