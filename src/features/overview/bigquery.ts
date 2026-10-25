import { rangeLength } from "@/lib/filters";
import { SALES_CHANNEL_PREDICATE, VALID_SALES_CHANNEL_SQL, summaryMeasure } from "@/lib/data/channel-sql";
/**
 * Overview, live. One query aggregates the store's channel and sub-channel
 * rows to daily totals and computes the period totals in the same pass, so
 * totals are never computed from a truncated list. Order measures count the
 * valid sales channels only, as the catalog defines them; spend and traffic
 * count every row.
 */
import "server-only";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import { GRAIN_SQL } from "@/lib/time-grain";
import type { OverviewData, OverviewFilters } from "./queries";
import { OVERVIEW_RELATION, OverviewChannelRow, OverviewRow, toOverviewData } from "./rows";
import { CACHE_POLICY } from "@/lib/data/query-cache";

/**
 * One row per date, so the longest allowed range bounds the result; past it is an error, not a shorter
 * answer. A same-dates-last-year baseline can hold one more day, Feb 29.
 */
const MAX_ROWS = appConfig.summaryMaxDays + 1;

export async function queryOverview(filters: OverviewFilters): Promise<OverviewData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "overview_daily",
    cache: CACHE_POLICY.aggregate,
    maxRows: Math.min(MAX_ROWS, rangeLength(filters.range)),
    sql: `
      WITH scoped AS (
        SELECT date, sm_channel, sm_sub_channel, ${summaryMeasure("website_sessions")}, ${summaryMeasure("ad_spend")},
          ${summaryMeasure("order_gross_revenue")} AS order_gross_revenue,
          ${summaryMeasure("order_discounts")} AS order_discounts,
          ${summaryMeasure("order_refunds")} AS order_refunds,
          ${summaryMeasure("order_net_revenue")} AS order_net_revenue,
          ${summaryMeasure("order_count")} AS order_count,
          ${summaryMeasure("new_customer_order_net_revenue")} AS new_customer_order_net_revenue,
          ${summaryMeasure("new_customer_order_count")} AS new_customer_order_count,
          ${summaryMeasure("repeat_customer_order_net_revenue")} AS repeat_customer_order_net_revenue,
          ${summaryMeasure("repeat_customer_order_count")} AS repeat_customer_order_count
        FROM ${warehouse.table(OVERVIEW_RELATION)}
        WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
          AND ${SALES_CHANNEL_PREDICATE}
      ), contributions AS (
        SELECT sm_channel AS channel, sm_sub_channel AS sub_channel, SUM(order_net_revenue) AS revenue,
          ROW_NUMBER() OVER (ORDER BY ABS(SUM(order_net_revenue)) DESC NULLS LAST, sm_channel, sm_sub_channel) AS rank
        FROM scoped WHERE ${VALID_SALES_CHANNEL_SQL} GROUP BY sm_channel, sm_sub_channel
      ), contribution_rows AS (
        SELECT channel, sub_channel, CAST(revenue AS STRING) AS revenue, FALSE AS remainder FROM contributions WHERE rank <= 200
        UNION ALL
        SELECT CAST(NULL AS STRING), CAST(NULL AS STRING), CAST(SUM(revenue) AS STRING), TRUE FROM contributions WHERE rank > 200 HAVING COUNT(*) > 0
      ), daily AS (
        SELECT
          date,
          SUM(order_gross_revenue) AS gross,
          SUM(order_discounts) AS discounts,
          SUM(order_refunds) AS refunds,
          SUM(order_net_revenue) AS net_revenue,
          SUM(order_count) AS order_count,
          SUM(website_sessions) AS website_sessions,
          SUM(ad_spend) AS ad_spend,
          SUM(new_customer_order_net_revenue) AS first_revenue,
          SUM(new_customer_order_count) AS first_orders,
          SUM(repeat_customer_order_net_revenue) AS repeat_revenue,
          SUM(repeat_customer_order_count) AS repeat_orders
        FROM scoped
        GROUP BY date
      )
      SELECT
        date,
        net_revenue,
        order_count,
        website_sessions,
        ad_spend,
        DATE_TRUNC(date, ${GRAIN_SQL[filters.grain ?? "day"]}) AS period_date,
        SUM(net_revenue) OVER period AS period_net_revenue,
        SUM(order_count) OVER period AS period_order_count,
        SUM(website_sessions) OVER period AS period_website_sessions,
        SUM(ad_spend) OVER period AS period_ad_spend,
        SUM(gross) OVER () AS total_gross,
        SUM(discounts) OVER () AS total_discounts,
        SUM(refunds) OVER () AS total_refunds,
        SUM(net_revenue) OVER () AS total_net_revenue,
        SUM(order_count) OVER () AS total_order_count,
        SUM(website_sessions) OVER () AS total_website_sessions,
        SUM(ad_spend) OVER () AS total_ad_spend,
        SUM(first_revenue) OVER () AS total_first_revenue,
        SUM(first_orders) OVER () AS total_first_orders,
        SUM(repeat_revenue) OVER () AS total_repeat_revenue,
        SUM(repeat_orders) OVER () AS total_repeat_orders,
        IF(ROW_NUMBER() OVER (ORDER BY date) = 1,
          (SELECT TO_JSON_STRING(ARRAY_AGG(STRUCT(channel, sub_channel, revenue, remainder) ORDER BY remainder, channel, sub_channel)) FROM contribution_rows),
          NULL) AS contributions_json,
        MAX(date) OVER () AS latest_date
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
  return toOverviewData(decodeRows(OverviewRow, result.rows, OVERVIEW_RELATION));
}

export async function queryOverviewChannels(filters: OverviewFilters): Promise<string[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "overview_channels",
    cache: CACHE_POLICY.aggregate,
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
  return decodeRows(OverviewChannelRow, result.rows, OVERVIEW_RELATION).map((row) => row.channel);
}
