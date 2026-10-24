import { expect, it, vi } from "vitest";
import { goLive, rowsResponse } from "../helpers/live";
import { googleError } from "../fake-bigquery/fake-bigquery";
import { loadReportMetadata } from "@/lib/data/report-metadata.server";
vi.unmock("@/lib/request-scope");
const schemaFields = ["table_name", "column_name", "data_type"].map((name) => ({ name, type: "STRING" }));
const payloadFields = ["kind", "payload"].map((name) => ({ name, type: "STRING" }));
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
const observation = {
  dataset: "sm_transformed_v2",
  relation: "obt_orders",
  storeId: "store-a",
  hasData: true,
  recentRecord: true,
  observedDate: "2026-10-22",
};
it("batches and deduplicates two initial jobs, preserves scoped dates, and never claims freshness or completeness", async () => {
  const fake = await goLive({
    submit: (call) =>
      (call.body as { query: string }).query.includes("INFORMATION_SCHEMA")
        ? rowsResponse(schemaFields, schema)
        : rowsResponse(payloadFields, [{ kind: "source", payload: JSON.stringify(observation) }]),
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
  const submits = fake.calls.filter((call) => call.kind === "submit");
  expect(submits).toHaveLength(2);
  const sql = (submits[1]?.body as { query: string }).query;
  expect(sql).toContain("CAST(NULL AS STRING) AS value_format");
  expect(sql).toContain("WHERE sm_store_id = @store_id");
  expect(sql).not.toContain("column_sample_");
  expect(sql).not.toContain("column_null_percentage");
  expect(sql.split("dim_semantic_metric_catalog`")[1]).not.toContain("WHERE sm_store_id");
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
