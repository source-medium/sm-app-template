/**
 * The overview query's result row, decoded exactly. Both the live query and
 * the sample produce rows in BigQuery's wire format and decode through this
 * schema, so the sample cannot drift from the live shape.
 */
import { z } from "zod";
import { bq } from "@/lib/data/decode";
import type { OverviewData } from "./queries";

export const OVERVIEW_RELATION = "rpt_executive_summary_daily";
export const OverviewChannelRow = z.object({ channel: bq.string() });

export const OverviewRow = z.object({
  date: bq.date(),
  net_revenue: bq.numeric().nullable(),
  order_count: bq.float64().nullable(),
  website_sessions: bq.int64().nullable(),
  ad_clicks: bq.int64().nullable(),
  ad_spend: bq.numeric().nullable(),
  period_date: bq.date(),
  period_net_revenue: bq.numeric().nullable(),
  period_order_count: bq.float64().nullable(),
  period_website_sessions: bq.int64().nullable(),
  period_ad_clicks: bq.int64().nullable(),
  period_ad_spend: bq.numeric().nullable(),
  total_net_revenue: bq.numeric().nullable(),
  total_order_count: bq.float64().nullable(),
  total_website_sessions: bq.int64().nullable(),
  total_ad_clicks: bq.int64().nullable(),
  total_ad_spend: bq.numeric().nullable(),
});

export type OverviewRowData = z.output<typeof OverviewRow>;

export function toOverviewData(rows: OverviewRowData[]): OverviewData {
  const first = rows[0];
  return {
    days: rows.map((row) => ({
      date: row.date,
      netRevenue: row.net_revenue,
      orders: row.order_count,
      sessions: row.website_sessions,
      adClicks: row.ad_clicks,
      adSpend: row.ad_spend,
    })),
    summaries: [
      ...new Map(
        rows.map((row) => [
          row.period_date,
          {
            date: row.period_date,
            netRevenue: row.period_net_revenue,
            orders: row.period_order_count,
            sessions: row.period_website_sessions,
            adClicks: row.period_ad_clicks,
            adSpend: row.period_ad_spend,
          },
        ]),
      ).values(),
    ],
    totals: first
      ? {
          netRevenue: first.total_net_revenue,
          orders: first.total_order_count,
          sessions: first.total_website_sessions,
          adClicks: first.total_ad_clicks,
          adSpend: first.total_ad_spend,
        }
      : null,
  };
}
