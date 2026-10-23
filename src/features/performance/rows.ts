import { datesInRange } from "@/lib/filters";
import { periodStart } from "@/lib/time-grain";
import { z } from "zod";
import { appConfig } from "@/app.config";
import { bq } from "@/lib/data/decode";

export const BUSINESS_RELATION = "rpt_executive_summary_daily";
export const PLATFORM_RELATION = "rpt_ad_performance_daily";
export const MAX_BUSINESS_ROWS = appConfig.summaryMaxDays + 1;
export const BUSINESS_FIELDS = {
  gross: "order_gross_revenue",
  discounts: "order_discounts",
  demand: "order_gross_revenue_after_discounts",
  refunds: "order_refunds",
  revenue: "order_net_revenue",
  spend: "ad_spend",
  first_revenue: "new_customer_order_net_revenue",
  repeat_revenue: "repeat_customer_order_net_revenue",
  orders: "order_count",
  first_orders: "new_customer_order_count",
  repeat_orders: "repeat_customer_order_count",
  sessions: "website_sessions",
} as const;
export const PLATFORM_FIELDS = {
  spend: "ad_spend",
  impressions: "ad_impressions",
  clicks: "ad_clicks",
  conversions: "ad_platform_reported_conversions",
  revenue: "ad_platform_reported_revenue",
} as const;
const period = { period_date: bq.date().nullable(), is_total: bq.bool() };
export const BusinessRow = z.object({
  ...period,
  gross: bq.numeric().nullable(),
  discounts: bq.numeric().nullable(),
  demand: bq.numeric().nullable(),
  refunds: bq.numeric().nullable(),
  revenue: bq.numeric().nullable(),
  spend: bq.numeric().nullable(),
  first_revenue: bq.numeric().nullable(),
  repeat_revenue: bq.numeric().nullable(),
  orders: bq.float64().nullable(),
  first_orders: bq.float64().nullable(),
  repeat_orders: bq.float64().nullable(),
  sessions: bq.int64().nullable(),
});
export const PlatformRow = z.object({
  ...period,
  platform: bq.string().nullable(),
  combined: bq.bool(),
  spend: bq.numeric().nullable(),
  impressions: bq.int64().nullable(),
  clicks: bq.int64().nullable(),
  conversions: bq.float64().nullable(),
  revenue: bq.float64().nullable(),
});
export type BusinessRecord = z.output<typeof BusinessRow>;
export type PlatformRecord = z.output<typeof PlatformRow>;

/** Bound each grain's aggregate result, including its full-selection total. */
export function performanceRowLimit(
  range: import("@/lib/filters").DateRange,
  grain: import("@/lib/time-grain").TimeGrain,
): number {
  const periods = new Set(datesInRange(range).map((date) => periodStart(date, grain))).size;
  return Math.min(MAX_BUSINESS_ROWS, periods + 1);
}
