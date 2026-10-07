import { afterEach, expect, it, vi } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../../../tests/helpers/live";
import type { ProductFilters } from "./queries";
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const fields = [
  ...["product_key", "label", "reference"].map((name) => ({ name, type: "STRING" })),
  ...[
    "revenue",
    "units",
    "profit",
    "previous_revenue",
    "previous_units",
    "previous_profit",
    "total_revenue",
    "total_units",
    "total_profit",
    "total_previous_revenue",
    "total_previous_units",
    "total_previous_profit",
    "minimum_value",
  ].map((name) => ({ name, type: "NUMERIC" })),
];
const row = {
  product_key: "p1",
  label: "Product",
  reference: "shopify / p1",
  revenue: "9007199254740993.123456789",
  units: "1.5",
  total_revenue: "9007199254740993.123456789",
};
const filters: ProductFilters = {
  storeId: "store' --",
  range: { from: "2026-09-01", to: "2026-09-02" },
  dimension: "variant",
  metric: "units",
};

it("guards, parameterizes and aggregates valid product lines before the limit, retaining NUMERIC precision", async () => {
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        fields,
        Array.from({ length: 11 }, (_, i) => ({ ...row, product_key: `p${i}` })),
      ),
  });
  const { getProducts } = await import("./queries");
  const data = await getProducts(filters, { from: "2025-09-01", to: "2025-09-02" });
  expect(data.rows).toHaveLength(10);
  expect(data.hasMore).toBe(true);
  expect(data.rows[0]?.revenue).toBe(row.revenue);
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string; queryParameters: unknown[] };
  expect(body.query).toContain("sm_store_id = @store_id AND is_order_sm_valid = TRUE");
  expect(body.query).toContain("sm_product_variant_key");
  expect(body.query).toContain("SUM(revenue) OVER () AS total_revenue");
  expect(body.query).toContain("ORDER BY units DESC NULLS LAST");
  expect(body.query).not.toContain(filters.storeId);
  expect(body.queryParameters).toContainEqual({
    name: "store_id",
    parameterType: { type: "STRING" },
    parameterValue: { value: filters.storeId },
  });
});
it("rejects unexpected truncation instead of publishing uncertain totals", async () => {
  await goLive({
    submit: () =>
      rowsResponse(
        fields,
        Array.from({ length: 11 }, () => row),
        { pageToken: "more" },
      ),
  });
  const { getProducts } = await import("./queries");
  await expect(getProducts(filters, null)).rejects.toMatchObject({ kind: "result_too_large" });
});
it("denies another store before either loader can query", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, []) });
  vi.stubEnv("APP_STORE_ID", "allowed");
  const { getProducts } = await import("./queries");
  const { queryProducts } = await import("./bigquery");
  await expect(getProducts(filters, null)).rejects.toThrow("This store is not available");
  await expect(queryProducts(filters, null)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
