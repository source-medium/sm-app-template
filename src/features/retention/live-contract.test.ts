import { expect, it, vi } from "vitest";
import { goLive, rowsResponse } from "../../../tests/helpers/live";

const fields = [
  { name: "channel", type: "STRING" },
  { name: "cohort_month", type: "DATE" },
  { name: "month_age", type: "INTEGER" },
  ...["cohort_size", "customers", "second_orders", "cumulative_revenue", "cumulative_profit"].map((name) => ({
    name,
    type: "NUMERIC",
  })),
];
const row = {
  channel: "online_dtc",
  cohort_month: "2026-01-01",
  month_age: "0",
  cohort_size: "100.5",
  customers: "100.5",
  second_orders: "10",
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

it("reads one exact dimension/value slice with bound parameters, including quoted names", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [row]) });
  const { getRetention } = await import("./queries");
  const segment = "Welcome' OR TRUE --";
  const result = await getRetention({ ...filters, dimension: "campaign", segment });
  expect(result).toHaveLength(1);
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string; queryParameters: unknown[] };
  expect(body.query).toContain(
    "acquisition_order_filter_dimension = @dimension AND acquisition_order_filter_dimension_value = @segment",
  );
  expect(body.query).not.toContain(segment);
  expect(body.queryParameters).toContainEqual({
    name: "segment",
    parameterType: { type: "STRING" },
    parameterValue: { value: segment },
  });
  expect(body.queryParameters).toContainEqual({
    name: "dimension",
    parameterType: { type: "STRING" },
    parameterValue: { value: "campaign" },
  });
});

it("does not query or silently pool segments before one is selected", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [row]) });
  const { getRetention, getRetentionSegments } = await import("./queries");
  const { queryRetention } = await import("./bigquery");
  expect(await getRetention({ ...filters, dimension: "campaign" })).toEqual([]);
  expect(await queryRetention({ ...filters, dimension: "campaign" })).toEqual([]);
  expect(await getRetentionSegments({ ...filters, channel: "online_dtc", search: "" })).toEqual({
    values: [],
    truncated: false,
  });
  expect(fake.calls).toHaveLength(0);
});

it("bounds and labels partial segment options without truncating cohort data", async () => {
  const values = Array.from({ length: 201 }, (_, i) => ({ segment: `Campaign ${i}` }));
  const fake = await goLive({ submit: () => rowsResponse([{ name: "segment", type: "STRING" }], values) });
  const { getRetentionSegments } = await import("./queries");
  const result = await getRetentionSegments({
    ...filters,
    dimension: "campaign",
    channel: "online_dtc",
    search: "x'_%",
  });
  expect(result.values).toHaveLength(200);
  expect(result.truncated).toBe(true);
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string; queryParameters: unknown[] };
  expect(body.query).toContain("sm_store_id = @store_id");
  expect(body.query).toContain("cohort_month BETWEEN @cohort_from AND @as_of_month");
  expect(body.query).toContain("months_since_first_order = 0");
  expect(body.query).toContain("STRPOS(LOWER(acquisition_order_filter_dimension_value), LOWER(@search))");
  expect(body.query).toContain("LIMIT 201");
  expect(body.query).not.toContain("x'_%");
  expect(body.queryParameters).toContainEqual({
    name: "search",
    parameterType: { type: "STRING" },
    parameterValue: { value: "x'_%" },
  });
});

it("denies cross-store segment discovery before any warehouse request", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed");
  const { getRetentionSegments } = await import("./queries");
  const { queryRetentionSegments } = await import("./bigquery");
  const scoped = { ...filters, dimension: "campaign" as const, channel: "online_dtc", search: "" };
  await expect(getRetentionSegments(scoped)).rejects.toThrow("This store is not available");
  await expect(queryRetentionSegments(scoped)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
