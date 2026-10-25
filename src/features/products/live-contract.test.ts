import { expect, it, vi } from "vitest";
import { periodColumns, periodSql } from "@/lib/data/period-sql";
import { PRODUCT_MEASURES } from "./rows";
import { goLive, rowsResponse } from "../../../tests/helpers/live";
import type { ProductFilters } from "./queries";

const fields = [
  ...[...periodColumns(PRODUCT_MEASURES), ...periodColumns(PRODUCT_MEASURES, "total_"), "minimum_value"].map(
    (name) => ({
      name,
      type: "NUMERIC",
    }),
  ),
  ...["product_key", "label", "reference"].map((name) => ({ name, type: "STRING" })),
  ...periodColumns(["latest_date"]).map((name) => ({ name, type: "DATE" })),
];
const row = {
  product_key: "p1",
  label: "Product",
  reference: "shopify / p1",
  latest_date: "2026-09-02",
  previous_latest_date: null,
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
  const data = await getProducts(filters, [{ from: "2025-09-01", to: "2025-09-02" }, null]);
  expect(data.rows).toHaveLength(10);
  expect(data.hasMore).toBe(true);
  expect(data.rows[0]?.revenue).toBe(row.revenue);
  expect(data.rows[0]?.image_url).toBeNull();
  const body = fake.submitted(0);
  expect(body.query).toContain("sm_store_id = @store_id AND is_order_sm_valid = TRUE");
  expect(body.query).toContain(
    periodSql("DATE(order_processed_at_local_datetime)").dateTimeRows("order_processed_at_local_datetime"),
  );
  expect(body.query).toContain("sm_product_variant_key");
  expect(body.query).toContain("ORDER BY order_processed_at_local_datetime DESC, CONCAT(COALESCE(product_title");
  expect(body.query).not.toContain("sm_order_line_key");
  expect(body.query).not.toContain("dim_product_variants");
  expect(body.query).not.toContain("primary_product_image_url");
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
it.each(["value", "gainers", "decliners"] as const)(
  "%s excludes comparison-only products after window totals and before the ranked limit",
  async (ranking) => {
    const ranked = Array.from({ length: 3 }, (_, i) => ({ ...row, product_key: `p${i}` }));
    const fake = await goLive({ submit: () => rowsResponse(fields, ranked) });
    const { getProducts } = await import("./queries");
    const data = await getProducts({ ...filters, ranking }, [null, { from: "2025-09-01", to: "2025-09-02" }]);
    expect(data.rows.map((entry) => entry.product_key)).toEqual(["p0", "p1", "p2"]);
    expect(data.hasMore).toBe(false);
    const sql = fake.submitted(0).query;
    // QUALIFY runs after the windows: baseline-only rows still contribute to their totals.
    expect(sql).toContain("SUM(previous_units) OVER () AS total_previous_units");
    expect(sql).toContain("SUM(second_units) OVER () AS total_second_units");
    expect(sql).not.toContain("WHERE units IS NOT NULL");
    expect(sql).toContain("QUALIFY units IS NOT NULL");
    expect(sql.indexOf("QUALIFY units IS NOT NULL")).toBeLessThan(sql.lastIndexOf("ORDER BY"));
    expect(sql.lastIndexOf("ORDER BY")).toBeLessThan(sql.lastIndexOf("LIMIT 11"));
  },
);
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
  await expect(getProducts(filters, [null, null])).rejects.toMatchObject({ kind: "result_too_large" });
});
it("denies another store before either loader can query", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, []) });
  vi.stubEnv("APP_STORE_ID", "allowed");
  const { getProductCoverage, getProductChannels, getProducts } = await import("./queries");
  const { queryProductCoverage, queryProductChannels, queryProducts } = await import("./bigquery");
  await expect(getProductCoverage(filters)).rejects.toThrow("This store is not available");
  await expect(queryProductCoverage(filters)).rejects.toThrow("This store is not available");
  await expect(getProducts(filters, [null, null])).rejects.toThrow("This store is not available");
  await expect(queryProducts(filters, [null, null])).rejects.toThrow("This store is not available");
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
  const body = fake.submitted(0);
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

it("aggregates exact cost coverage for the full selected scope in a narrow independent query", async () => {
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        [
          ...["lines", "missing_cost_lines", "zero_cost_lines"].map((name) => ({ name, type: "INTEGER" })),
          ...["ordered_units", "refunded_units"].map((name) => ({ name, type: "NUMERIC" })),
        ],
        [
          {
            lines: "9007199254740993",
            missing_cost_lines: "2",
            zero_cost_lines: "3",
            ordered_units: "100.5",
            refunded_units: "1.5",
          },
        ],
      ),
  });
  const { getProductCoverage } = await import("./queries");
  expect(await getProductCoverage(filters)).toEqual({
    lines: 9007199254740993n,
    missing_cost_lines: 2n,
    zero_cost_lines: 3n,
    ordered_units: "100.5",
    refunded_units: "1.5",
  });
  const body = fake.submitted(0);
  expect(body.query).toContain("sm_store_id = @store_id AND is_order_sm_valid = TRUE");
  expect(body.query).toContain("COUNTIF(order_line_id IS NOT NULL) AS lines");
  expect(body.query).toContain("COUNTIF(order_line_id IS NOT NULL AND order_line_product_cost IS NULL)");
  expect(body.query).toContain("COUNTIF(order_line_id IS NOT NULL AND order_line_product_cost = 0)");
  expect(body.query).toContain("SUM(order_line_quantity) AS ordered_units");
  expect(body.query).toContain("-SUM(order_line_refund_quantity) AS refunded_units");
  expect(body.query).not.toContain("WHERE order_line_id IS NOT NULL");
  expect(body.query).not.toContain("product_title");
  expect(body.query).not.toContain("GROUP BY");
  expect(body.query).not.toContain(filters.channel);
  expect(body.queryParameters).toContainEqual({
    name: "channel",
    parameterType: { type: "STRING" },
    parameterValue: { value: filters.channel },
  });
});

it("scopes detail totals before windows and ranks changes before the bounded limit", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, []) });
  const { getProducts } = await import("./queries");
  const identity = 'compound-identity" OR TRUE --';
  await getProducts({ ...filters, entity: identity, ranking: "decliners" }, [
    { from: "2026-08-01", to: "2026-08-02" },
    null,
  ]);
  const body = fake.submitted(0);
  expect(body.query).toContain("FROM grouped WHERE product_key = @entity");
  expect(body.query).toContain("ORDER BY units - previous_units ASC NULLS LAST, product_key LIMIT 11");
  expect(body.query).not.toContain(identity);
  expect(body.queryParameters).toContainEqual({
    name: "entity",
    parameterType: { type: "STRING" },
    parameterValue: { value: identity },
  });
});
