/**
 * Ad delivery summed over each compared period, as the paid marketing and
 * creatives KPIs read it from rpt_ad_performance_daily. SQL sums each period;
 * every ratio is of those sums, never an average of daily ratios.
 */
import type { z } from "zod";
import type { Polarity } from "@/lib/comparison";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { bq, toChartNumber } from "@/lib/data/decode";
import { periodFields, periodSql, type PeriodPrefix } from "@/lib/data/period-sql";

export type AdTotals = {
  /** NUMERIC, exact decimal text: SUM(ad_spend). */
  spend: string | null;
  impressions: bigint | null;
  clicks: bigint | null;
  /** FLOAT64: platform-reported, can be fractional. */
  conversions: number | null;
  /** FLOAT64, attributed by the ad platform. */
  revenue: number | null;
};

export type AdPeriods<T extends AdTotals = AdTotals> = { current: T; baselines: readonly [T, T] };

const period = periodSql("date");

/** Each period's sums, as `spend`, `previous_spend` and `second_spend` and so on; adTotalsFields decodes them. */
export const AD_PERIOD_SUMS = [
  period.sum("ad_spend", "spend"),
  period.sum("ad_impressions", "impressions"),
  period.sum("ad_clicks", "clicks"),
  period.sum("ad_platform_reported_conversions", "conversions"),
  period.sum("ad_platform_reported_revenue", "revenue"),
].join(",\n        ");

export const adTotalsFields = {
  ...periodFields(["spend"], bq.numeric().nullable()),
  ...periodFields(["impressions", "clicks"], bq.int64().nullable()),
  ...periodFields(["conversions", "revenue"], bq.float64().nullable()),
};

type AdTotalsRow = { [K in keyof typeof adTotalsFields]: z.output<(typeof adTotalsFields)[K]> };

/** One period's sums from a row that AD_PERIOD_SUMS wrote. */
export function adTotals(row: AdTotalsRow, prefix: PeriodPrefix): AdTotals {
  return {
    spend: row[`${prefix}spend`],
    impressions: row[`${prefix}impressions`],
    clicks: row[`${prefix}clicks`],
    conversions: row[`${prefix}conversions`],
    revenue: row[`${prefix}revenue`],
  };
}

/** Platform ROAS, cost per conversion and CTR of one period's sums; a missing or zero input leaves the ratio missing. */
export function adRatios(totals: AdTotals) {
  const spend = decimalToNumber(totals.spend);
  return {
    roas: ratio(totals.revenue, spend),
    cpo: ratio(spend, totals.conversions),
    ctr: ratio(
      totals.clicks === null ? null : toChartNumber(totals.clicks),
      totals.impressions === null ? null : toChartNumber(totals.impressions),
    ),
  };
}

/** Which way each measure improves; spend and delivery are context, not goals. */
export const AD_POLARITY = {
  spend: "neutral",
  impressions: "neutral",
  clicks: "neutral",
  conversions: "higher",
  revenue: "higher",
  roas: "higher",
  cpo: "lower",
  ctr: "higher",
} as const satisfies Record<string, Polarity>;
