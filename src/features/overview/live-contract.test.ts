/** Overview's live path end to end against the fake BigQuery. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../../../tests/helpers/live";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const FIELDS = [
  { name: "date", type: "DATE" },
  { name: "net_revenue", type: "NUMERIC" },
  { name: "order_count", type: "FLOAT" },
  { name: "website_sessions", type: "INTEGER" },
  { name: "ad_clicks", type: "INTEGER" },
  { name: "ad_spend", type: "NUMERIC" },
  { name: "total_net_revenue", type: "NUMERIC" },
  { name: "total_order_count", type: "FLOAT" },
  { name: "total_website_sessions", type: "INTEGER" },
  { name: "total_ad_clicks", type: "INTEGER" },
  { name: "total_ad_spend", type: "NUMERIC" },
];
// NUMERIC money stays exact text, even past float precision.
const MONEY = {
  net_revenue: "0.1",
  ad_spend: "0.2",
  total_net_revenue: "0.3",
  total_ad_spend: "123456789012345678.123456789",
};
const FILTERS = { storeId: "store-1", range: { from: "2026-09-01", to: "2026-09-02" } };

describe("overview, live", () => {
  it("queries comparison periods separately with identical store scope and exact SQL totals", async () => {
    const fake = await goLive({
      submit: (call) => {
        const body = call.body as { queryParameters: { name: string; parameterValue: { value: string } }[] };
        const from = body.queryParameters.find((param) => param.name === "start_date")?.parameterValue.value;
        if (!from) throw new Error("Missing start_date parameter");
        const revenue = from === "2026-09-01" ? "100.01" : "80.01";
        return rowsResponse(FIELDS, [{ date: from, ...MONEY, total_net_revenue: revenue }]);
      },
    });
    const { getOverviewReport } = await import("./queries");
    const report = await getOverviewReport(FILTERS, { from: "2025-09-01", to: "2025-09-02" });
    expect(report.current.totals?.netRevenue).toBe("100.01");
    expect(report.comparison?.data?.totals?.netRevenue).toBe("80.01");
    const submits = fake.calls.filter((call) => call.kind === "submit");
    expect(submits).toHaveLength(2);
    const bodies = submits.map(
      (call) => call.body as { query: string; queryParameters: { name: string; parameterValue: { value: string } }[] },
    );
    expect(bodies[0]?.query).toBe(bodies[1]?.query);
    const parameters = bodies.map((body) =>
      Object.fromEntries(body.queryParameters.map((param) => [param.name, param.parameterValue.value])),
    );
    expect(parameters).toEqual(
      expect.arrayContaining([
        { store_id: "store-1", start_date: "2026-09-01", end_date: "2026-09-02" },
        { store_id: "store-1", start_date: "2025-09-01", end_date: "2025-09-02" },
      ]),
    );
  });

  it("makes only one query when comparison is off", async () => {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, []) });
    const { getOverviewReport } = await import("./queries");
    expect((await getOverviewReport(FILTERS, null)).comparison).toBeNull();
    expect(fake.count("submit")).toBe(1);
  });

  it("keeps the current report when comparison data is truncated", async () => {
    await goLive({
      submit: (call) => {
        const body = call.body as { queryParameters: { name: string; parameterValue: { value: string } }[] };
        const from = body.queryParameters.find((param) => param.name === "start_date")?.parameterValue.value;
        if (!from) throw new Error("Missing start_date parameter");
        if (from === "2025-09-01")
          return rowsResponse(FIELDS, [], {
            pageToken: "more",
            rows: Array.from({ length: 100 }, () => ({ f: FIELDS.map(() => ({ v: "1" })) })),
          });
        return rowsResponse(FIELDS, [{ date: from, ...MONEY }]);
      },
    });
    const { getOverviewReport } = await import("./queries");
    const report = await getOverviewReport(FILTERS, { from: "2025-09-01", to: "2025-09-02" });
    expect(report.current.totals?.netRevenue).toBe("0.3");
    expect(report.comparison?.data).toBeNull();
    expect(report.comparison?.error).toMatchObject({ kind: "result_too_large" });
  });

  it("does not turn an empty baseline into zero totals", async () => {
    await goLive({ submit: () => rowsResponse(FIELDS, []) });
    const { getOverviewReport } = await import("./queries");
    const report = await getOverviewReport(FILTERS, { from: "2025-09-01", to: "2025-09-02" });
    expect(report.comparison).toEqual({ data: { days: [], totals: null }, error: null });
  });

  it("queries one store and range, and decodes exact totals", async () => {
    const fake = await goLive({
      submit: () =>
        rowsResponse(FIELDS, [
          {
            ...MONEY,
            date: "2026-09-01",
            order_count: "10.5",
            website_sessions: "9007199254740993",
            ad_clicks: "4",
            total_order_count: "20.5",
            total_website_sessions: "9007199254741000",
            total_ad_clicks: "9",
          },
          {
            ...MONEY,
            date: "2026-09-02",
            order_count: "10",
            website_sessions: "7",
            ad_clicks: "5",
            total_order_count: "20.5",
            total_website_sessions: "9007199254741000",
            total_ad_clicks: "9",
          },
        ]),
    });
    const { getOverview } = await import("./queries");
    const data = await getOverview(FILTERS);
    expect(data.totals).toEqual({
      netRevenue: "0.3",
      orders: 20.5,
      sessions: 9_007_199_254_741_000n,
      adClicks: 9n,
      adSpend: "123456789012345678.123456789",
    });
    expect(data.days[0]?.sessions).toBe(9_007_199_254_740_993n);

    const submit = fake.calls.find((call) => call.kind === "submit")?.body as {
      query: string;
      queryParameters: unknown[];
      labels: Record<string, string>;
    };
    expect(submit.query).toContain("`sm-demotenant.sm_transformed_v2.rpt_executive_summary_daily`");
    expect(submit.query).toContain("sm_store_id = @store_id");
    expect(submit.queryParameters).toEqual([
      { name: "store_id", parameterType: { type: "STRING" }, parameterValue: { value: "store-1" } },
      { name: "start_date", parameterType: { type: "DATE" }, parameterValue: { value: "2026-09-01" } },
      { name: "end_date", parameterType: { type: "DATE" }, parameterValue: { value: "2026-09-02" } },
    ]);
    expect(submit.labels.sm_query).toBe("overview_daily");
  });

  it("treats truncation as an error rather than a smaller total", async () => {
    await goLive({
      submit: () =>
        rowsResponse(FIELDS, [], {
          pageToken: "more",
          rows: Array.from({ length: 100 }, () => ({ f: FIELDS.map(() => ({ v: "1" })) })),
        }),
    });
    const { getOverview } = await import("./queries");
    await expect(getOverview(FILTERS)).rejects.toMatchObject({ kind: "result_too_large" });
  });

  it("names the column when the relation changed shape", async () => {
    await goLive({
      submit: () =>
        rowsResponse(FIELDS, [
          {
            date: "2026-09-01",
            order_count: "1",
            ...MONEY,
            website_sessions: "1.5",
            ad_clicks: "1",
            total_order_count: "1",
            total_website_sessions: "1",
            total_ad_clicks: "1",
          },
        ]),
    });
    const { getOverview } = await import("./queries");
    await expect(getOverview(FILTERS)).rejects.toMatchObject({
      kind: "incompatible_schema",
      column: "website_sessions",
    });
  });
});

// Exercise direct calls as well as pages: middleware cannot be the store boundary.
it("refuses another store in dispatch and live loaders before any warehouse call", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const { getOverview } = await import("./queries");
  const { queryOverview } = await import("./bigquery");
  await expect(getOverview(FILTERS)).rejects.toThrow("This store is not available");
  await expect(queryOverview(FILTERS)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

it("allows the fixed store and keeps every SQL read scoped to it", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", FILTERS.storeId);
  const { getOverview } = await import("./queries");
  await getOverview(FILTERS);
  const queries = fake.calls.filter((call) => call.kind === "submit");
  expect(queries.length).toBeGreaterThan(0);
  for (const call of queries) {
    const body = call.body as { query: string; queryParameters: unknown[] };
    expect(body.query).toContain("sm_store_id = @store_id");
    expect(body.queryParameters).toContainEqual({
      name: "store_id",
      parameterType: { type: "STRING" },
      parameterValue: { value: FILTERS.storeId },
    });
  }
});
