import { expect, it } from "vitest";
import { sumDecimals } from "@/lib/data/decimal";
import { aggregateProducts, sampleProducts, type ProductSource } from "./sample";
import type { ProductFilters } from "./queries";

const filters: ProductFilters = {
  storeId: "sample-store-a",
  range: { from: "2026-09-01", to: "2026-09-02" },
  dimension: "product",
  metric: "revenue",
};
const line: ProductSource = {
  storeId: filters.storeId,
  date: "2026-09-01",
  valid: true,
  channel: "Online DTC",
  source: "shopify",
  productId: "p1",
  variantId: "v1",
  title: "Same title",
  variant: "Small",
  revenue: "0.1",
  units: "1.5",
  profit: "0.05",
};

it("sums exact valid-order lines without merging duplicate titles, platforms, or variants", () => {
  const source = [
    line,
    { ...line, variantId: "v2", revenue: "0.2" },
    { ...line, productId: "p2" },
    { ...line, source: "amazon" },
    { ...line, valid: false, revenue: "100" },
    { ...line, storeId: "other", revenue: "100" },
    { ...line, date: "2026-09-03", revenue: "100" },
  ];
  const data = aggregateProducts(source, filters, null);
  expect(data.rows).toHaveLength(3);
  expect(data.rows[0]).toMatchObject({
    revenue: "0.3",
    units: "3",
    total_revenue: "0.5",
    total_units: "6",
    total_profit: "0.2",
    previous_revenue: null,
  });
  expect(aggregateProducts(source, { ...filters, dimension: "variant" }, null).rows).toHaveLength(4);
});

it("keeps full totals before top ten and gives both periods the same product scope", () => {
  const source = Array.from({ length: 12 }, (_, index) => ({
    ...line,
    productId: `p${index}`,
    revenue: String(index + 1),
    profit: index === 0 ? "-1" : "1",
  }));
  const data = aggregateProducts([...source, { ...line, date: "2026-08-31", revenue: "4" }], filters, {
    from: "2026-08-30",
    to: "2026-08-31",
  });
  expect(data.hasMore).toBe(true);
  expect(data.rows).toHaveLength(10);
  expect(data.rows[0]?.total_revenue).toBe("78");
  expect(sumDecimals(data.rows.map((row) => row.revenue))).toBe("75");
  expect(data.rows[0]?.total_previous_revenue).toBe("4");
  expect(aggregateProducts(source, { ...filters, metric: "profit" }, null).rows[0]?.minimum_value).toBe("-1");
});

it("provides deterministic sample rows for both stores and empty results for an unknown store", () => {
  expect(sampleProducts(filters, null)).toEqual(sampleProducts(filters, null));
  expect(sampleProducts({ ...filters, storeId: "sample-store-b" }, null).rows[0]?.total_revenue).not.toBe(
    sampleProducts(filters, null).rows[0]?.total_revenue,
  );
  expect(sampleProducts({ ...filters, storeId: "unknown" }, null)).toEqual({ rows: [], hasMore: false });
});

it("filters channels before both period totals and leaves unknown channels empty", () => {
  const baseline = { from: "2026-08-01", to: "2026-08-31" };
  const source = [
    line,
    { ...line, date: "2026-08-01", revenue: "0.2" },
    { ...line, channel: "Amazon", revenue: "100" },
    { ...line, channel: "Amazon", date: "2026-08-01", revenue: "200" },
    { ...line, channel: null, revenue: "4" },
  ];
  expect(aggregateProducts(source, { ...filters, channel: "Online DTC" }, baseline).rows[0]).toMatchObject({
    total_revenue: "0.1",
    total_previous_revenue: "0.2",
  });
  expect(aggregateProducts(source, { ...filters, channel: "(none)" }, baseline).rows[0]?.total_revenue).toBe("4");
  expect(aggregateProducts(source, { ...filters, channel: "unknown" }, baseline).rows).toEqual([]);
});
