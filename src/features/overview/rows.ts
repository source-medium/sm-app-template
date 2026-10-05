/**
 * The overview query's result row, decoded exactly. Both the live query and
 * the sample produce rows in BigQuery's wire format and decode through this
 * schema, so the sample cannot drift from the live shape.
 */
import { z } from "zod";
import { bq } from "@/lib/data/decode";
import type { OverviewData } from "./queries";

export const OVERVIEW_RELATION = "rpt_executive_summary_daily";

export const OverviewRow = z.object({
  date: bq.date(),
  order_count: bq.float64().nullable(),
  website_sessions: bq.int64().nullable(),
  ad_clicks: bq.int64().nullable(),
  total_order_count: bq.float64().nullable(),
  total_website_sessions: bq.int64().nullable(),
  total_ad_clicks: bq.int64().nullable(),
});

export type OverviewRowData = z.output<typeof OverviewRow>;

export function toOverviewData(rows: OverviewRowData[]): OverviewData {
  const first = rows[0];
  return {
    days: rows.map((row) => ({
      date: row.date,
      orders: row.order_count,
      sessions: row.website_sessions,
      adClicks: row.ad_clicks,
    })),
    totals: first
      ? { orders: first.total_order_count, sessions: first.total_website_sessions, adClicks: first.total_ad_clicks }
      : null,
  };
}
