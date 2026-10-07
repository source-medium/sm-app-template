import { afterEach, expect, it, vi } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../../../tests/helpers/live";
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
const fields = [
  { name: "channel", type: "STRING" },
  { name: "cohort_month", type: "DATE" },
  { name: "month_age", type: "INTEGER" },
  ...["cohort_size", "customers", "cumulative_revenue", "cumulative_profit"].map((name) => ({ name, type: "NUMERIC" })),
];
const row = {
  channel: "online_dtc",
  cohort_month: "2026-01-01",
  month_age: "0",
  cohort_size: "100.5",
  customers: "100.5",
  cumulative_revenue: "9007199254740993.123456789",
  cumulative_profit: "1.5",
};
const filters = { storeId: "store' --", asOf: "2026-09" };

it("reads one unsegmented slice per channel/age and filters out incomplete calendar months", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [row]) });
  const { getRetention } = await import("./queries");
  const data = await getRetention(filters);
  expect(data[0]).toMatchObject({ cohort_size: "100.5", cumulative_revenue: row.cumulative_revenue, month_age: 0n });
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string; queryParameters: unknown[] };
  expect(body.query).toContain("sm_store_id = @store_id");
  expect(body.query).toContain("acquisition_order_filter_dimension = 'no_filters'");
  expect(body.query).toContain("sm_order_line_type = 'all_orders'");
  expect(body.query).toContain("DATE_ADD(cohort_month, INTERVAL months_since_first_order MONTH) <= @as_of_month");
  expect(body.query).not.toContain(filters.storeId);
  expect(body.queryParameters).toContainEqual({
    name: "cohort_from",
    parameterType: { type: "DATE" },
    parameterValue: { value: "2025-10-01" },
  });
});
it("rejects truncated cohort data", async () => {
  await goLive({
    submit: () =>
      rowsResponse(
        fields,
        Array.from({ length: 2000 }, () => row),
        { pageToken: "more" },
      ),
  });
  const { getRetention } = await import("./queries");
  await expect(getRetention(filters)).rejects.toMatchObject({ kind: "result_too_large" });
});
it("denies another store in dispatcher and SQL loader without a warehouse call", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, []) });
  vi.stubEnv("APP_STORE_ID", "allowed");
  const { getRetention } = await import("./queries");
  const { queryRetention } = await import("./bigquery");
  await expect(getRetention(filters)).rejects.toThrow("This store is not available");
  await expect(queryRetention(filters)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
