import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { toChartNumber } from "@/lib/data/decode";
import type { BusinessRecord, PlatformRecord } from "./rows";

/** Ratios are recomputed from full bucket sums, never averaged across dates or platforms. */
export function businessRatios(row: BusinessRecord) {
  const spend = decimalToNumber(row.spend);
  const revenue = decimalToNumber(row.revenue);
  return {
    average: ratio(revenue, row.orders),
    mer: ratio(revenue, spend),
    cpo: ratio(spend, row.orders),
    cps: ratio(spend, row.sessions === null ? null : toChartNumber(row.sessions)),
    spend_share: ratio(spend, revenue),
    first_average: ratio(decimalToNumber(row.first_revenue), row.first_orders),
    repeat_average: ratio(decimalToNumber(row.repeat_revenue), row.repeat_orders),
    repeat_share: ratio(decimalToNumber(row.repeat_revenue), revenue),
  };
}
export function platformRatios(row: PlatformRecord) {
  const spend = decimalToNumber(row.spend);
  const clicks = row.clicks === null ? null : toChartNumber(row.clicks);
  const impressions = row.impressions === null ? null : toChartNumber(row.impressions);
  const cpm = ratio(spend, impressions);
  return {
    ctr: ratio(clicks, impressions),
    cpm: cpm === null ? null : cpm * 1000,
    cpc: ratio(spend, clicks),
    cvr: ratio(row.conversions, clicks),
    roas: ratio(row.revenue, spend),
    average: ratio(row.revenue, row.conversions),
    cpo: ratio(spend, row.conversions),
  };
}
