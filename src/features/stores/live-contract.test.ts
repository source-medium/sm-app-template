import { expect, it, vi } from "vitest";
import { goLive, rowsResponse, withStores, isStoreList, requestHeaders } from "../../../tests/helpers/live";

const fields = [
  { name: "sm_store_id", type: "STRING" },
  ...["revenue", "previous_revenue", "spend", "previous_spend"].map((name) => ({ name, type: "NUMERIC" })),
  ...["orders", "previous_orders"].map((name) => ({ name, type: "FLOAT64" })),
  ...["latest_date", "previous_latest_date"].map((name) => ({ name, type: "DATE" })),
];
const range = { from: "2026-09-01", to: "2026-09-07" };
const baseline = { from: "2026-08-25", to: "2026-08-31" };
const id = "store\"\\' --";
const row = {
  sm_store_id: id,
  revenue: "9007199254740993.123456789",
  orders: "1.5",
  latest_date: "2026-09-06",
  previous_latest_date: "2026-08-31",
};

it("makes one bounded summary query for the canonical roster, preserves precision and missing stores", async () => {
  const fake = await goLive({ submit: withStores(() => rowsResponse(fields, [row]), [id, "empty-store"]) });
  const { getStoreComparison } = await import("./queries");
  const data = await getStoreComparison(range, baseline);
  expect(data).toHaveLength(2);
  expect(data[0]?.summary).toMatchObject({ revenue: row.revenue, orders: 1.5, latest_date: "2026-09-06" });
  expect(data[1]?.summary).toBeNull();
  const queries = fake.calls.filter((call) => call.kind === "submit" && !isStoreList(call));
  expect(queries).toHaveLength(1);
  const body = queries[0]?.body as { query: string; queryParameters: unknown[]; maxResults: number };
  expect(body.query).toContain("sm_store_id IN UNNEST(JSON_VALUE_ARRAY(@store_ids))");
  expect(body.query).toContain("GROUP BY sm_store_id");
  expect(body.query).not.toContain("OVER ()");
  expect(body.query).not.toContain(id);
  expect(body.queryParameters).toContainEqual({
    name: "store_ids",
    parameterType: { type: "STRING" },
    parameterValue: { value: JSON.stringify([id, "empty-store"]) },
  });
  expect(body.queryParameters).toContainEqual({
    name: "baseline_from",
    parameterType: { type: "DATE" },
    parameterValue: { value: baseline.from },
  });
});
it("rejects fixed-store access at both exported boundaries without querying", async () => {
  const fake = await goLive({ submit: withStores(() => rowsResponse(fields, [])) });
  vi.stubEnv("APP_STORE_ID", "store-1");
  const { getStoreComparison } = await import("./queries");
  const { queryStoreComparison } = await import("./bigquery");
  await expect(getStoreComparison(range, null)).rejects.toThrow("This store is not available");
  await expect(queryStoreComparison(range, null)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
it("requires an authenticated viewer before querying", async () => {
  const fake = await goLive({ submit: withStores(() => rowsResponse(fields, [])) });
  requestHeaders.current = new Headers();
  const { getStoreComparison } = await import("./queries");
  await expect(getStoreComparison(range, null)).rejects.toThrow();
  expect(fake.calls).toHaveLength(0);
});
it("skips the summary job for an empty roster", async () => {
  const fake = await goLive({ submit: withStores(() => rowsResponse(fields, []), []) });
  const { getStoreComparison } = await import("./queries");
  await expect(getStoreComparison(range, null)).resolves.toEqual([]);
  expect(fake.calls.filter((call) => call.kind === "submit" && !isStoreList(call))).toHaveLength(0);
});
it("fails explicitly on truncation instead of publishing incomplete totals", async () => {
  await goLive({
    submit: withStores(() =>
      rowsResponse(
        fields,
        Array.from({ length: 50 }, () => row),
        { pageToken: "more" },
      ),
    ),
  });
  const { getStoreComparison } = await import("./queries");
  await expect(getStoreComparison(range, null)).rejects.toMatchObject({ kind: "result_too_large" });
});
