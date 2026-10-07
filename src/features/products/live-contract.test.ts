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
  channel: "Amazon' OR TRUE --",
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
  expect(body.query).not.toContain(filters.channel);
  expect(body.query).toContain("(@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)");
  expect(body.queryParameters).toContainEqual({
    name: "channel",
    parameterType: { type: "STRING" },
    parameterValue: { value: filters.channel },
  });
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
  const { getProductChannels, getProducts } = await import("./queries");
  const { queryProductChannels, queryProducts } = await import("./bigquery");
  await expect(getProducts(filters, null)).rejects.toThrow("This store is not available");
  await expect(queryProducts(filters, null)).rejects.toThrow("This store is not available");
  await expect(getProductChannels(filters)).rejects.toThrow("This store is not available");
  await expect(queryProductChannels(filters)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

it("scopes the complete channel roster to store/date and refuses a truncated picker", async () => {
  let truncate = false;
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        [{ name: "channel", type: "STRING" }],
        truncate
          ? Array.from({ length: 50 }, (_, i) => ({ channel: String(i) }))
          : [{ channel: "(none)" }, { channel: "Amazon" }],
        truncate ? { pageToken: "more" } : {},
      ),
  });
  const { getProductChannels } = await import("./queries");
  expect(await getProductChannels(filters)).toEqual(["(none)", "Amazon"]);
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string; queryParameters: unknown[] };
  expect(body.query).toContain("SELECT DISTINCT IFNULL(sm_channel, '(none)') AS channel");
  expect(body.query).toContain("sm_store_id = @store_id");
  expect(body.query).toContain("order_processed_at_local_datetime >= DATETIME(@start_date)");
  expect(body.query).not.toContain("@channel");
  expect(body.query).not.toContain("@cursor");
  expect(body.query).not.toContain("@search");
  expect(body.query).toContain("is_order_sm_valid = TRUE");
  truncate = true;
  await expect(getProductChannels(filters)).rejects.toMatchObject({ kind: "result_too_large" });
});
