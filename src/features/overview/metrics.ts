import definitions from "../../../contracts/dashboard-metrics-v1/definitions.json";
import type { MetricBinding, PublishedMetric } from "@/lib/metric-binding";
import { validSales } from "@/lib/data/channel-sql";
import { OVERVIEW_RELATION } from "./rows";

const canonical = (name: string): PublishedMetric => {
  const metric = definitions.metrics.find((metric) => metric.metric_name === name);
  if (!metric) throw new Error(`Missing reviewed metric ${name}`);
  return metric;
};
const base = {
  source: OVERVIEW_RELATION,
  reviewedDependencies: definitions.metrics,
  population:
    "Published Executive Summary rows for the selected store, dates and sales channels. Revenue and order measures count SourceMedium's valid sales channels; spend and sessions count every row.",
  grain: "Selected period, aggregated from daily channel/sub-channel rows",
  dateBasis: "Published summary date in the store's reporting timezone",
  attribution: "Summary reporting; marketing efficiency is not platform-attributed ROAS.",
  limitations: [
    "Definition equivalence does not prove live numerical reconciliation.",
    "Pipeline freshness and selected-period completeness are unknown.",
  ],
};
export const overviewBindings = [
  {
    ...base,
    id: "revenue",
    label: "Net revenue",
    canonical: canonical("order_net_revenue_summary"),
    calculation: `SUM(${validSales("order_net_revenue")})`,
    fields: ["order_net_revenue"],
    format: "currency",
  },
  {
    ...base,
    id: "orders",
    label: "Summary orders",
    canonical: canonical("order_count_summary"),
    calculation: `SUM(${validSales("order_count")})`,
    fields: ["order_count"],
    format: "count",
  },
  {
    ...base,
    id: "spend",
    label: "Ad spend",
    canonical: canonical("total_ad_spend_summary"),
    calculation: "SUM(ad_spend)",
    fields: ["ad_spend"],
    format: "currency",
  },
  {
    ...base,
    id: "mer",
    label: "Marketing efficiency (MER)",
    canonical: canonical("marketing_efficiency_ratio_summary"),
    calculation: `SUM(${validSales("order_net_revenue")}) / SUM(ad_spend)`,
    numerator: "Summary net revenue",
    denominator: "Summary ad spend",
    fields: ["order_net_revenue", "ad_spend"],
    format: "ratio",
  },
  {
    ...base,
    id: "average",
    label: "Revenue per summary order",
    calculation: `SUM(${validSales("order_net_revenue")}) / SUM(${validSales("order_count")})`,
    numerator: "Summary net revenue",
    denominator: "Summary orders, not valid-order count",
    fields: ["order_net_revenue", "order_count"],
    format: "currency",
  },
  {
    ...base,
    id: "sessions",
    label: "Website sessions",
    canonical: canonical("website_sessions_summary"),
    calculation: "SUM(website_sessions)",
    fields: ["website_sessions"],
    format: "count",
  },
] as const satisfies readonly MetricBinding[];
