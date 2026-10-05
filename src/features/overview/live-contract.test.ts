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
  { name: "order_count", type: "FLOAT" },
  { name: "website_sessions", type: "INTEGER" },
  { name: "ad_clicks", type: "INTEGER" },
  { name: "total_order_count", type: "FLOAT" },
  { name: "total_website_sessions", type: "INTEGER" },
  { name: "total_ad_clicks", type: "INTEGER" },
];
const FILTERS = { storeId: "store-1", range: { from: "2026-09-01", to: "2026-09-02" } };

describe("overview, live", () => {
  it("queries one store and range, and decodes exact totals", async () => {
    const fake = await goLive({
      submit: () =>
        rowsResponse(FIELDS, [
          {
            date: "2026-09-01",
            order_count: "10.5",
            website_sessions: "9007199254740993",
            ad_clicks: "4",
            total_order_count: "20.5",
            total_website_sessions: "9007199254741000",
            total_ad_clicks: "9",
          },
          {
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
    expect(data.totals).toEqual({ orders: 20.5, sessions: 9_007_199_254_741_000n, adClicks: 9n });
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
