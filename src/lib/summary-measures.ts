/**
 * Canonical Executive Summary columns used by the app. Order measures count
 * valid sales channels; spend and traffic count every row. New measures must
 * declare their scope before a summary query can use them.
 */
export const SUMMARY_MEASURE_SCOPES = {
  order_gross_revenue: "sales",
  order_discounts: "sales",
  order_gross_revenue_after_discounts: "sales",
  order_refunds: "sales",
  order_net_revenue: "sales",
  order_count: "sales",
  new_customer_order_net_revenue: "sales",
  new_customer_order_count: "sales",
  repeat_customer_order_net_revenue: "sales",
  repeat_customer_order_count: "sales",
  ad_spend: "all",
  website_sessions: "all",
  ad_clicks: "all",
} as const;

export type SummaryMeasure = keyof typeof SUMMARY_MEASURE_SCOPES;

/** Sample rows also contain dimensions, which are not measures. */
export function isSummaryOrderMeasure(column: string): boolean {
  return Object.hasOwn(SUMMARY_MEASURE_SCOPES, column) && SUMMARY_MEASURE_SCOPES[column as SummaryMeasure] === "sales";
}
