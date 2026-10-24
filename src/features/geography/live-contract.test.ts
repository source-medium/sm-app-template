import { expect, it, vi } from "vitest";
import { goLive, rowsResponse } from "../../../tests/helpers/live";
const total = {
  kind: "total",
  location: "",
  date: null,
  records: "0",
  orders: "0",
  revenue: null,
  previous_records: "0",
  previous_orders: "0",
  previous_revenue: null,
  second_records: "0",
  second_orders: "0",
  second_revenue: null,
  second_latest_date: null,
  latest_date: null,
  previous_latest_date: null,
};
const fields = Object.keys(total).map((name) => ({ name, type: "STRING" }));
const filters = {
  storeId: "store-1",
  range: { from: "2024-02-28", to: "2024-03-10" },
  dateBasis: "created" as const,
  country: "US",
  region: "CA",
  channel: "Online DTC",
};
it("uses verified created dates without unsafe processed-date pruning and totals before the bounded grouping", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [total]) });
  const { getGeography } = await import("./queries");
  expect((await getGeography(filters, [null, null])).total.orders).toBe(0n);
  const body = fake.calls.find((call) => call.kind === "submit")?.body as {
    query: string;
    queryParameters: { name: string; parameterValue: { value: string } }[];
  };
  expect(body.query).toContain("DATE(order_created_at_local_datetime)");
  expect(body.query).not.toContain("order_processed_at_local_datetime");
  expect(body.query).toContain("WHERE sm_store_id = @store_id AND is_order_sm_valid = TRUE");
  expect(body.query).toContain("totals AS (SELECT");
  expect(body.query).toContain("FROM scoped)");
  expect(body.query).toContain("WHERE position > 500");
  // BigQuery otherwise infers INT64 for aggregate-branch NULLs in this UNION.
  expect(body.query).toContain("SELECT 'group', location, CAST(NULL AS DATE)");
  expect(body.query).toContain("SELECT 'remainder', '(other)', CAST(NULL AS DATE)");
  expect(body.query).toContain("@country");
  expect(body.queryParameters.find((row) => row.name === "region")?.parameterValue.value).toBe("CA");
});
it("scopes both dispatcher and direct live calls in a fixed-store deployment", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [total]) });
  vi.stubEnv("APP_STORE_ID", "other");
  const { getGeography } = await import("./queries");
  const { queryGeography } = await import("./bigquery");
  await expect(getGeography(filters, [null, null])).rejects.toThrow("This store is not available");
  await expect(queryGeography(filters, [null, null])).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
