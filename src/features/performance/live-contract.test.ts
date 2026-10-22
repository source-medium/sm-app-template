import { expect, it, vi } from "vitest";
import { goLive, rowsResponse } from "../../../tests/helpers/live";
import { BUSINESS_FIELDS, PLATFORM_FIELDS, MAX_BUSINESS_ROWS, MAX_PLATFORM_ROWS } from "./rows";
import type { PerformanceFilters } from "./queries";

const businessFields = [
  { name: "period_date", type: "DATE" },
  { name: "is_total", type: "BOOLEAN" },
  ...Object.keys(BUSINESS_FIELDS).map((name) => ({
    name,
    type:
      name === "sessions"
        ? "INTEGER"
        : ["orders", "first_orders", "repeat_orders"].includes(name)
          ? "FLOAT"
          : "NUMERIC",
  })),
];
const platformFields = [
  { name: "period_date", type: "DATE" },
  { name: "is_total", type: "BOOLEAN" },
  { name: "combined", type: "BOOLEAN" },
  { name: "platform", type: "STRING" },
  ...Object.keys(PLATFORM_FIELDS).map((name) => ({
    name,
    type: ["clicks", "impressions"].includes(name) ? "INTEGER" : name === "spend" ? "NUMERIC" : "FLOAT",
  })),
];
const filters: PerformanceFilters = {
  storeId: "store' --",
  range: { from: "2026-09-02", to: "2026-10-04" },
  channel: JSON.stringify(["online_dtc' --", "marketplace"]),
  grain: "week",
};
it.each(["business", "platforms"] as const)(
  "scopes %s, aggregates before returning totals and keeps wire precision",
  async (kind) => {
    const fields = kind === "business" ? businessFields : platformFields;
    const fake = await goLive({
      submit: () =>
        rowsResponse(fields, [
          {
            period_date: null,
            is_total: "true",
            combined: "true",
            platform: null,
            revenue: kind === "business" ? "9007199254740993.123456789" : "123.45",
            spend: "20.123456789",
            orders: "1.5",
            clicks: "9007199254740993",
            sessions: "9007199254740993",
            conversions: "2.5",
          },
        ]),
    });
    const { getBusiness, getPlatforms } = await import("./queries");
    const rows = await (kind === "business" ? getBusiness(filters) : getPlatforms(filters));
    expect(rows[0]?.spend).toBe("20.123456789");
    expect(rows[0]?.is_total).toBe(true);
    const body = fake.calls.find((call) => call.kind === "submit")?.body as {
      query: string;
      queryParameters: unknown[];
    };
    expect(body.query).toContain("sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date");
    expect(body.query).toContain("(@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)");
    expect(body.query).toContain("DATE_TRUNC(date, WEEK(MONDAY))");
    expect(body.query).toContain("GROUP BY GROUPING SETS");
    expect(body.query).not.toContain("LIMIT");
    expect(body.query).toContain("UNNEST(IFNULL(JSON_VALUE_ARRAY(@channel), ARRAY<STRING>[]))");
    expect(body.query).not.toContain(filters.storeId);
    expect(body.query).not.toContain(filters.channel);
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
    if (kind === "platforms") expect(body.query).toContain("COALESCE(source_system, '(unknown platform)') AS platform");
  },
);
it.each(["business", "platforms", "channels"] as const)("rejects truncated %s results", async (kind) => {
  await goLive({
    submit: () =>
      rowsResponse(
        kind === "channels"
          ? [{ name: "channel", type: "STRING" }]
          : kind === "business"
            ? businessFields
            : platformFields,
        Array.from(
          { length: kind === "channels" ? 51 : kind === "business" ? MAX_BUSINESS_ROWS + 1 : MAX_PLATFORM_ROWS + 1 },
          () => ({}),
        ),
        { pageToken: "more" },
      ),
  });
  const { getBusiness, getPlatforms, getPerformanceChannels } = await import("./queries");
  await expect(
    { business: getBusiness, platforms: getPlatforms, channels: getPerformanceChannels }[kind](filters),
  ).rejects.toMatchObject({ kind: "result_too_large" });
});
it("denies a different store before every live or dispatch loader can query", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed");
  const { getBusiness, getPlatforms, getPerformanceChannels } = await import("./queries");
  const { queryBusiness, queryPlatforms, queryPerformanceChannels } = await import("./bigquery");
  for (const loader of [
    getBusiness,
    getPlatforms,
    getPerformanceChannels,
    queryBusiness,
    queryPlatforms,
    queryPerformanceChannels,
  ])
    await expect(loader(filters)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});
it("queries a store/date-scoped roster from both sources without the active channel narrowing it", async () => {
  const fake = await goLive({
    submit: () => rowsResponse([{ name: "channel", type: "STRING" }], [{ channel: "online_dtc" }]),
  });
  const { getPerformanceChannels } = await import("./queries");
  expect(await getPerformanceChannels(filters)).toEqual(["online_dtc"]);
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string };
  expect(body.query.match(/sm_store_id = @store_id/g)).toHaveLength(2);
  expect(body.query).not.toContain("@channel");
});
