import { beforeEach, expect, it, vi } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../helpers/live";
import { TEST_PASSWORD } from "../helpers/service-account";
import { resetQueryCache, setQueryCacheEnabled } from "@/lib/data/query-cache.server";
import { googleError } from "../fake-bigquery/fake-bigquery";
import { loadReportMetadata } from "@/lib/data/report-metadata.server";
vi.unmock("@/lib/request-scope");
const schemaFields = ["table_name", "column_name", "data_type"].map((name) => ({ name, type: "STRING" }));
const payloadFields = [{ name: "payload", type: "STRING" }];
beforeEach(() => {
  resetQueryCache();
  setQueryCacheEnabled(true);
});
const schema = [
  ...["sm_store_id", "dataset_name", "table_name"].map((column_name) => ({
    table_name: "dim_data_dictionary",
    column_name,
    data_type: "STRING",
  })),
  ...["table_has_data", "table_has_fresh_data_14d"].map((column_name) => ({
    table_name: "dim_data_dictionary",
    column_name,
    data_type: "BOOL",
  })),
  { table_name: "dim_data_dictionary", column_name: "table_last_data_date", data_type: "DATE" },
  ...["metric_name", "calculation"].map((column_name) => ({
    table_name: "dim_semantic_metric_catalog",
    column_name,
    data_type: "STRING",
  })),
];
/** A catalog payload as the catalog read selects it: every column present, optional ones null. */
const publishedMetric = (metric_name: string) => ({
  metric_name,
  metric_label: null,
  metric_description: null,
  calculation: "SUM(order_net_revenue)",
  filter_condition: null,
  dependent_metrics: null,
  underlying_model: null,
  metric_time_expression: null,
  metric_time_grains: null,
  value_format: null,
  preferred_metric_name: null,
  abbreviations_list: null,
  metric_category: null,
  metric_type: null,
  semantic_model_name: null,
  cumulative_settings: null,
  has_filter: null,
  is_abbreviation: null,
  catalog_updated_at: null,
});
const observation = {
  dataset: "sm_transformed_v2",
  relation: "obt_orders",
  storeId: "store-a",
  hasData: true,
  recentRecord: true,
  observedDate: "2026-10-22",
};
it("runs a probe, the catalog and the store's observations once per request, then serves them from the cache", async () => {
  const fake = await goLive({
    submit: (call) => {
      const sql = (call.body as { query: string }).query;
      if (sql.includes("INFORMATION_SCHEMA")) return rowsResponse(schemaFields, schema);
      if (sql.includes("dim_semantic_metric_catalog`"))
        return rowsResponse(payloadFields, [{ payload: JSON.stringify(publishedMetric("order_net_revenue")) }]);
      return rowsResponse(payloadFields, [{ payload: JSON.stringify(observation) }]);
    },
  });
  vi.stubEnv("APP_STORE_ID", "store-a");
  const [a, b] = await Promise.all([
    loadReportMetadata("store-a", ["obt_orders", "obt_orders"]),
    loadReportMetadata("store-a", ["obt_orders"]),
  ]);
  expect(a).toBe(b);
  expect(a.sources[0]).toMatchObject({
    observedDate: "2026-10-22",
    freshness: "unknown",
    completeness: "unknown",
    quality: "unknown",
  });
  expect(a.metrics.map((metric) => metric.metric_name)).toEqual(["order_net_revenue"]);
  expect(a.metrics[0]?.metric_category).toBeNull();
  const submits = fake.calls.filter((call) => call.kind === "submit");
  expect(submits).toHaveLength(3);
  const sqls = submits.map((call) => (call.body as { query: string }).query);
  const catalogSql = sqls.find((sql) => sql.includes("dim_semantic_metric_catalog`"));
  const sourcesSql = sqls.find((sql) => sql.includes("JSON_QUERY_ARRAY(@sources)"));
  if (!catalogSql || !sourcesSql) throw new Error("Expected a catalog read and an observations read");
  expect(catalogSql).toContain("CAST(NULL AS STRING) AS value_format");
  expect(catalogSql).toContain("CAST(NULL AS STRING) AS metric_category");
  expect(catalogSql).not.toContain("WHERE sm_store_id");
  expect(sourcesSql).toContain("WHERE sm_store_id = @store_id");
  expect(sourcesSql).not.toContain("column_sample_");
  expect(sourcesSql).not.toContain("column_null_percentage");
  // A later request on this isolate: every metadata read is served from the cache.
  requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
  const again = await loadReportMetadata("store-a", ["obt_orders"]);
  expect(again.sources[0]?.observedDate).toBe("2026-10-22");
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(3);
});
it("permission failure stays denied, does not retry a smaller schema, and does not substitute samples", async () => {
  const fake = await goLive({ submit: () => googleError(403, "accessDenied") });
  const result = await loadReportMetadata("store-a", ["obt_orders"]);
  expect(result.mode).toBe("live");
  expect(result.catalog).toBe("denied");
  expect(result.sources[0]?.metadata).toBe("denied");
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1);
});
it("present incompatible types are incompatible rather than absent optional fields", async () => {
  const fake = await goLive({
    submit: () =>
      rowsResponse(schemaFields, [
        ...schema,
        { table_name: "dim_semantic_metric_catalog", column_name: "value_format", data_type: "INT64" },
      ]),
  });
  expect((await loadReportMetadata("store-a", ["obt_orders"])).catalog).toBe("incompatible");
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1);
});
it("refuses another store before metadata reads", async () => {
  const fake = await goLive({});
  vi.stubEnv("APP_STORE_ID", "store-b");
  await expect(loadReportMetadata("store-a", ["obt_orders"])).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
