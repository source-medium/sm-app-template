import { expect, it } from "vitest";
import definitions from "../../contracts/dashboard-metrics-v1/definitions.json";
import { VALID_SALES_CHANNEL_SQL, summaryMeasure } from "@/lib/data/channel-sql";
import { salesChannelLabel } from "@/lib/filters";
import { countedSales, sampleSummarySource } from "@/lib/sample/executive-summary";
import { isValidSalesChannel } from "@/lib/sales-channels";

const published = (name: string) => definitions.metrics.find((metric) => metric.metric_name === name);

it("counts summary order measures on the catalog's valid sales channels and spend and sessions on every row", () => {
  for (const name of ["order_count_summary", "order_net_revenue_summary"])
    expect(published(name)?.filter_condition).toBe(VALID_SALES_CHANNEL_SQL);
  for (const name of ["total_ad_spend_summary", "website_sessions_summary", "marketing_efficiency_ratio_summary"])
    expect(published(name)?.has_filter).toBe(false);
  expect(summaryMeasure("order_count")).toBe(`IF(${VALID_SALES_CHANNEL_SQL}, order_count, 0)`);
  expect(isValidSalesChannel("tiktok_shop")).toBe(true);
  expect(isValidSalesChannel("tiktok_shop_via_shopify")).toBe(false);
  expect(isValidSalesChannel(null)).toBe(false);
});

it("classifies every summary order column explicitly and leaves spend and traffic unfiltered", () => {
  for (const column of [
    "order_gross_revenue",
    "order_discounts",
    "order_gross_revenue_after_discounts",
    "order_refunds",
    "order_net_revenue",
    "order_count",
    "new_customer_order_net_revenue",
    "new_customer_order_count",
    "repeat_customer_order_net_revenue",
    "repeat_customer_order_count",
  ] as const)
    expect(summaryMeasure(column)).toBe(`IF(${VALID_SALES_CHANNEL_SQL}, ${column}, 0)`);
  for (const column of ["ad_spend", "website_sessions", "ad_clicks"] as const)
    expect(summaryMeasure(column)).toBe(column);
});

it("drops non-valid rows' order measures in sample data, as the live queries do, and keeps their traffic", () => {
  const rows = sampleSummarySource("sample-store-a", { from: "2026-09-01", to: "2026-09-07" }, "2026-10-01");
  const exchanged = rows.find((row) => row.sm_channel === "exchanged" && row.order_count > 0);
  const online = rows.find((row) => row.sm_channel === "online_dtc");
  if (!exchanged || !online) throw new Error("Expected valid and non-valid sample rows");
  expect(countedSales(exchanged)).toEqual({
    ...exchanged,
    order_net_revenue_cents: 0n,
    order_gross_revenue_cents: 0n,
    order_discounts_cents: 0n,
    order_refunds_cents: 0n,
    order_count: 0,
    new_customer_order_net_revenue_cents: 0n,
    new_customer_order_count: 0,
    repeat_customer_order_net_revenue_cents: 0n,
    repeat_customer_order_count: 0,
  });
  expect(countedSales(online)).toBe(online);
});

it("preserves valid-row nulls and fractional counts, and keeps non-sales spend and traffic", () => {
  const [source] = sampleSummarySource("sample-store-a", { from: "2026-09-01", to: "2026-09-01" }, "2026-10-01");
  if (!source) throw new Error("Expected a source row");
  const row = { ...source, order_count: 1.5, order_gross_revenue_cents: null, ad_spend_cents: 12345n };
  expect(countedSales(row)).toBe(row);
  expect(countedSales({ ...row, sm_channel: "walmart" })).toMatchObject({
    order_count: 0,
    order_gross_revenue_cents: 0n,
    ad_spend_cents: 12345n,
    website_sessions: row.website_sessions,
    ad_clicks: row.ad_clicks,
  });
});

it("names a channel scope without printing its URL encoding", () => {
  expect(salesChannelLabel(null)).toBe("All sales channels");
  expect(salesChannelLabel("online_dtc")).toBe("online_dtc");
  expect(salesChannelLabel('["online_dtc","amazon"]')).toBe("amazon, online_dtc");
});
