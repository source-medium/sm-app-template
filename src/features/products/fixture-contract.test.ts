import { expect, it } from "vitest";
import { sumDecimals } from "@/lib/data/decimal";
import { aggregateProducts, aggregateProductCoverage, sampleProducts, type ProductSource } from "./sample";
import type { ProductFilters } from "./queries";

const filters: ProductFilters = {
  storeId: "sample-store-a",
  range: { from: "2026-09-01", to: "2026-09-02" },
  dimension: "product",
  metric: "revenue",
};
const line: ProductSource = {
  storeId: filters.storeId,
  orderLineId: "line-1",
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
  refunds: "0",
  refunded_units: "0",
  ordered_units: "1.5",
  cost: "0.05",
};
it("reverses signed refunds without masking reversals or mixing comparison periods", () => {
  const rows = aggregateProducts(
    [
      { ...line, refunds: "-4.01", refunded_units: "-1", cost: null },
      { ...line, refunds: "0.01", refunded_units: "0.5", cost: "0" },
      { ...line, productId: "p2", refunds: "-10", cost: "2" },
      { ...line, valid: false, refunds: "-999", cost: null },
      { ...line, date: "2026-08-31", refunds: "-2", cost: null },
    ],
    { ...filters, metric: "refunds" },
    [{ from: "2026-08-31", to: "2026-08-31" }, null],
  ).rows;
  expect(rows[0]).toMatchObject({
    refunds: "10",
    total_refunds: "14",
    total_refunded_units: "0.5",
    total_previous_refunds: "2",
  });
  expect(rows[1]).toMatchObject({ refunds: "4" });
});

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
  const data = aggregateProducts(source, filters, [null, null]);
  expect(data.rows).toHaveLength(3);
  expect(data.rows[0]).toMatchObject({
    revenue: "0.3",
    units: "3",
    total_revenue: "0.5",
    total_units: "6",
    total_profit: "0.2",
    previous_revenue: null,
  });
  expect(aggregateProducts(source, { ...filters, dimension: "variant" }, [null, null]).rows).toHaveLength(4);
});

it("keeps full totals before top ten and gives both periods the same product scope", () => {
  const source = Array.from({ length: 12 }, (_, index) => ({
    ...line,
    productId: `p${index}`,
    revenue: String(index + 1),
    profit: index === 0 ? "-1" : "1",
  }));
  const data = aggregateProducts([...source, { ...line, date: "2026-08-31", revenue: "4" }], filters, [
    { from: "2026-08-30", to: "2026-08-31" },
    null,
  ]);
  expect(data.hasMore).toBe(true);
  expect(data.rows).toHaveLength(10);
  expect(data.rows[0]?.total_revenue).toBe("78");
  expect(sumDecimals(data.rows.map((row) => row.revenue))).toBe("75");
  expect(data.rows[0]?.total_previous_revenue).toBe("4");
  expect(aggregateProducts(source, { ...filters, metric: "profit" }, [null, null]).rows[0]?.minimum_value).toBe("-1");
});

it("provides deterministic sample rows for both stores and empty results for an unknown store", () => {
  expect(sampleProducts(filters, [null, null])).toEqual(sampleProducts(filters, [null, null]));
  expect(sampleProducts({ ...filters, storeId: "sample-store-b" }, [null, null]).rows[0]?.total_revenue).not.toBe(
    sampleProducts(filters, [null, null]).rows[0]?.total_revenue,
  );
  expect(sampleProducts({ ...filters, storeId: "unknown" }, [null, null])).toEqual({ rows: [], hasMore: false });
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
  expect(aggregateProducts(source, { ...filters, channel: "Online DTC" }, [baseline, null]).rows[0]).toMatchObject({
    total_revenue: "0.1",
    total_previous_revenue: "0.2",
  });
  expect(aggregateProducts(source, { ...filters, channel: "(none)" }, [baseline, null]).rows[0]?.total_revenue).toBe(
    "4",
  );
  expect(aggregateProducts(source, { ...filters, channel: "unknown" }, [baseline, null]).rows).toEqual([]);
});

it("returns each period's latest date with valid lines, for comparison coverage", () => {
  const source = [
    line,
    { ...line, productId: "p2", date: "2026-09-02", valid: false },
    { ...line, date: "2026-08-30" },
    { ...line, date: "2026-08-31", productId: "p3" },
  ];
  const data = aggregateProducts(source, filters, [{ from: "2026-08-30", to: "2026-08-31" }, null]);
  expect(data.rows[0]).toMatchObject({ latest_date: line.date, previous_latest_date: "2026-08-31" });
  expect(aggregateProducts(source, filters, [null, null]).rows[0]).toMatchObject({ previous_latest_date: null });
});

it("counts costs only on real lines while retaining summary adjustments in unit totals", () => {
  expect(
    aggregateProductCoverage(
      [
        { ...line, cost: null, refunded_units: "-1" },
        { ...line, cost: "0" },
        { ...line, orderLineId: null, cost: "0", ordered_units: "0", refunded_units: "-0.5" },
        { ...line, orderLineId: null, cost: null, ordered_units: "0", refunded_units: "0" },
        { ...line, valid: false, cost: null },
        { ...line, channel: "Amazon", cost: null },
        { ...line, date: "2026-08-31", cost: null },
        { ...line, storeId: "other", cost: null },
      ],
      { ...filters, channel: "Online DTC" },
    ),
  ).toEqual({ lines: 2n, missing_cost_lines: 1n, zero_cost_lines: 1n, ordered_units: "3", refunded_units: "1.5" });
});
