/** A bounded, developer-owned source selection; URL values never become SQL identifiers. */
export const DATA_SOURCES = [
  "rpt_executive_summary_daily",
  "rpt_ad_performance_daily",
  "obt_orders",
  "obt_order_lines",
  "rpt_cohort_ltv_by_first_valid_purchase_attribute_no_product_filters",
  "fct_order_attribution_signals",
] as const;
/** The page's destinations; `metrics` is the previous name of Explore and still opens it. */
export const DATA_TABS = ["explore", "fields", "health", "metrics"] as const;
export type DataTab = (typeof DATA_TABS)[number];
