import { expect, it, vi } from "vitest";
import { goLive, rowsResponse } from "../../../tests/helpers/live";
import { googleError, type SubmittedQuery } from "../../../tests/fake-bigquery/fake-bigquery";
import { sampleProducts } from "./sample";
import type { ProductFilters } from "./queries";

const filters: ProductFilters = {
  storeId: "sample-store-a",
  range: { from: "2026-09-01", to: "2026-09-07" },
  dimension: "product",
  metric: "revenue",
};
const products = sampleProducts(filters, [null, null]).rows;
const fields = ["product_key", "image_url"].map((name) => ({ name, type: "STRING" }));

it.each(["product", "variant"] as const)(
  "loads one bounded, parameterized image per %s identity",
  async (dimension) => {
    const keys = ['identity" OR TRUE --', "another identity"];
    const fake = await goLive({
      submit: () =>
        rowsResponse(fields, [
          { product_key: keys[0] ?? "", image_url: " https://cdn.example.com/product.webp " },
          { product_key: keys[1] ?? "", image_url: "javascript:alert(1)" },
        ]),
    });
    const { queryProductImages } = await import("./bigquery");
    expect(await queryProductImages({ ...filters, dimension }, keys)).toEqual(
      new Map([
        [keys[0], "https://cdn.example.com/product.webp"],
        [keys[1], null],
      ]),
    );
    expect(fake.count("submit")).toBe(1);
    const body = fake.submitted(0);
    expect(body.query).toContain("sm_store_id = @store_id");
    expect(body.query).toContain("IN UNNEST(JSON_VALUE_ARRAY(@product_keys))");
    expect(body.query).toContain("GROUP BY product_key");
    expect(body.query).toContain("product_variant_updated_at DESC, primary_product_image_url DESC");
    expect(body.query.includes("sm_product_variant_key")).toBe(dimension === "variant");
    expect(body.query).not.toContain(keys[0]);
    expect(body.query).not.toContain("obt_order_lines");
    expect(body.queryParameters).toEqual([
      { name: "store_id", parameterType: { type: "STRING" }, parameterValue: { value: filters.storeId } },
      { name: "product_keys", parameterType: { type: "STRING" }, parameterValue: { value: JSON.stringify(keys) } },
    ]);
  },
);

it.each([
  ["missing catalog", () => googleError(404, "notFound")],
  ["changed catalog schema", () => googleError(400, "invalidQuery")],
  ["catalog permission", () => googleError(403, "accessDenied")],
  ["catalog byte ceiling", () => googleError(400, "bytesBilledLimitExceeded")],
  [
    "invalid catalog row",
    () => rowsResponse(fields, [{ product_key: null, image_url: "https://cdn.example.com/a.jpg" }]),
  ],
  [
    "oversized catalog result",
    () =>
      rowsResponse(
        fields,
        products.map((row) => ({ product_key: row.product_key, image_url: null })),
        { pageToken: "more" },
      ),
  ],
] as const)("%s leaves successful financial data available with photo fallbacks", async (_name, response) => {
  const financialFields = Object.keys(products[0] ?? {})
    .filter((name) => name !== "image_url")
    .map((name) => ({ name, type: "STRING" }));
  const fake = await goLive({
    submit: (call) =>
      (call.body as SubmittedQuery).labels.sm_query === "product_images"
        ? response()
        : rowsResponse(financialFields, products),
  });
  const { getProductImages, getProducts } = await import("./queries");
  const data = await getProducts(filters, [null, null]);
  expect(await getProductImages(filters, data.rows)).toEqual(new Map());
  expect(data.rows.map((row) => row.revenue)).toEqual(products.map((row) => row.revenue));
  expect(data.rows[0]?.total_revenue).toBe(products[0]?.total_revenue);
  expect(fake.count("submit")).toBe(2);
});

it("does not query catalog images for an empty report", async () => {
  const fake = await goLive({});
  const { getProductImages } = await import("./queries");
  expect(await getProductImages(filters, [])).toEqual(new Map());
  expect(fake.calls).toHaveLength(0);
});

it("keeps store authorization outside the optional-image fallback", async () => {
  const fake = await goLive({});
  vi.stubEnv("APP_STORE_ID", "another-store");
  const { getProductImages } = await import("./queries");
  const { queryProductImages } = await import("./bigquery");
  await expect(getProductImages(filters, products)).rejects.toThrow("This store is not available");
  await expect(queryProductImages(filters, ["identity"])).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
