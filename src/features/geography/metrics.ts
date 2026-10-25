import type { MetricBinding } from "@/lib/metric-binding";
import { reviewedMetric } from "@/lib/reviewed-metrics";
import type { OrderDateBasis } from "@/lib/order-scope";
export function geographyBindings(basis: OrderDateBasis): MetricBinding[] {
  const base = {
    source: "obt_orders",
    population: "is_order_sm_valid = TRUE; selected store, dates, sales channels and shipping destinations",
    grain: "Selected period, by shipping country or country-scoped region",
    dateBasis:
      basis === "created"
        ? "DATE(order_created_at_local_datetime)"
        : "DATE(COALESCE(order_processed_at_local_datetime, order_created_at_local_datetime))",
    attribution: "Order sales to shipping destinations; no geographic advertising attribution",
    limitations: [
      "Shipping destination is not residence, website location or ad-delivery geography.",
      "Executive Summary has a different population; these totals do not reconcile it.",
      "Definition equivalence does not establish live numerical reconciliation.",
    ],
  };
  return [
    {
      ...base,
      id: "revenue",
      label: "Valid-order net revenue",
      ...(basis === "processed" ? { canonical: reviewedMetric("order_net_revenue") } : {}),
      calculation: "SUM(order_net_revenue) WHERE is_order_sm_valid = TRUE",
      fields: ["order_net_revenue", "is_order_sm_valid"],
      format: "currency",
    },
    {
      ...base,
      id: "orders",
      label: "Valid orders",
      ...(basis === "processed" ? { canonical: reviewedMetric("order_count") } : {}),
      calculation: "COUNT(sm_order_key) WHERE is_order_sm_valid = TRUE",
      fields: ["sm_order_key", "is_order_sm_valid"],
      format: "count",
    },
  ];
}
