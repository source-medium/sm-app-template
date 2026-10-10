/**
 * Overview, live. One query aggregates the store's channel and sub-channel
 * rows to daily totals and computes the period totals in the same pass, so
 * totals are never computed from a truncated list.
 */
import "server-only";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import { WarehouseError } from "@/lib/data/warehouse-error";
import type { TimeGrain } from "@/lib/time-grain";
import type { OverviewData, OverviewFilters } from "./queries";
import { OVERVIEW_RELATION, OverviewChannelRow, OverviewRow, toOverviewData } from "./rows";

/**
 * One row per date, so the longest allowed range bounds the result; past it is an error, not a shorter
 * answer. A same-dates-last-year baseline can hold one more day, Feb 29.
 */
const MAX_ROWS = appConfig.dateRange.maxDays + 1;
const GRAIN_SQL: Record<TimeGrain, string> = { day: "DAY", week: "WEEK(MONDAY)", month: "MONTH" };

export async function queryOverview(filters: OverviewFilters): Promise<OverviewData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
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
          SUM(ad_spend) AS ad_spend,
          SUM(new_customer_order_net_revenue) AS first_revenue,
          SUM(new_customer_order_count) AS first_orders,
          SUM(repeat_customer_order_net_revenue) AS repeat_revenue,
          SUM(repeat_customer_order_count) AS repeat_orders
        FROM ${warehouse.table(OVERVIEW_RELATION)}
        WHERE sm_store_id = @store_id
          AND date BETWEEN @start_date AND @end_date
          AND (@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)
        GROUP BY date
      )
      SELECT
        date,
        net_revenue,
        order_count,
        website_sessions,
        ad_clicks,
        ad_spend,
        DATE_TRUNC(date, ${GRAIN_SQL[filters.grain ?? "day"]}) AS period_date,
        SUM(net_revenue) OVER period AS period_net_revenue,
        SUM(order_count) OVER period AS period_order_count,
        SUM(website_sessions) OVER period AS period_website_sessions,
        SUM(ad_clicks) OVER period AS period_ad_clicks,
        SUM(ad_spend) OVER period AS period_ad_spend,
        SUM(net_revenue) OVER () AS total_net_revenue,
        SUM(order_count) OVER () AS total_order_count,
        SUM(website_sessions) OVER () AS total_website_sessions,
        SUM(ad_clicks) OVER () AS total_ad_clicks,
        SUM(ad_spend) OVER () AS total_ad_spend,
        SUM(first_revenue) OVER () AS total_first_revenue,
        SUM(first_orders) OVER () AS total_first_orders,
        SUM(repeat_revenue) OVER () AS total_repeat_revenue,
        SUM(repeat_orders) OVER () AS total_repeat_orders
      FROM daily
      WINDOW period AS (PARTITION BY DATE_TRUNC(date, ${GRAIN_SQL[filters.grain ?? "day"]}))
      ORDER BY date`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
    ],
  });
  if (result.truncated) throw new WarehouseError("result_too_large", { reason: "overview_daily" });
  return toOverviewData(decodeRows(OverviewRow, result.rows, OVERVIEW_RELATION));
}

export async function queryOverviewChannels(filters: OverviewFilters): Promise<string[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "overview_channels",
    maxRows: 50,
    sql: `SELECT DISTINCT IFNULL(sm_channel, '(none)') AS channel
      FROM ${warehouse.table(OVERVIEW_RELATION)}
      WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
      ORDER BY channel`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
    ],
  });
  if (result.truncated) throw new WarehouseError("result_too_large", { reason: "overview_channels" });
  return decodeRows(OverviewChannelRow, result.rows, OVERVIEW_RELATION).map((row) => row.channel);
}
