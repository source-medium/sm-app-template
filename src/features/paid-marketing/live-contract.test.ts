/** Paid marketing's live path end to end against the fake BigQuery. */
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FakeCall } from "../../../tests/fake-bigquery/fake-bigquery";
import { goLive, requestHeaders, rowsResponse } from "../../../tests/helpers/live";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const SERIES_FIELDS = [
  { name: "channel", type: "STRING" },
  { name: "date", type: "DATE" },
  { name: "spend", type: "NUMERIC" },
  { name: "impressions", type: "INTEGER" },
  { name: "clicks", type: "INTEGER" },
  { name: "conversions", type: "FLOAT" },
];
const CAMPAIGN_FIELDS = [
  { name: "campaign_id", type: "STRING" },
  { name: "campaign_name", type: "STRING" },
  { name: "channel", type: "STRING" },
  { name: "spend", type: "NUMERIC" },
  { name: "impressions", type: "INTEGER" },
  { name: "clicks", type: "INTEGER" },
  { name: "conversions", type: "FLOAT" },
  { name: "platform_revenue", type: "FLOAT" },
];
const SERIES_ROW = {
  channel: "Meta",
  date: "2026-09-01",
  spend: "0.1",
  impressions: "9007199254740993",
  clicks: "3",
  conversions: "1.5",
};
const CAMPAIGN_ROW = {
  campaign_id: "c1",
  campaign_name: "Prospecting",
  channel: "Meta",
  spend: "123456789012345678.123456789",
  impressions: "10",
  clicks: "1",
  conversions: "0.5",
  platform_revenue: "2.5",
};
const FILTERS = { storeId: "store-1", range: { from: "2026-09-01", to: "2026-09-02" }, channel: "Meta" };

type Submitted = { query: string; queryParameters: unknown[]; labels: Record<string, string> };
const queryName = (call: FakeCall) => (call.body as Submitted).labels.sm_query;

describe("paid marketing, live", () => {
  it("exports through the real guard, query, and decoders, without reading the chart", async () => {
    const fake = await goLive({
      submit: () =>
        rowsResponse(CAMPAIGN_FIELDS, [{ ...CAMPAIGN_ROW, campaign_name: "=1+1", impressions: "9007199254740993" }]),
    });
    const { GET } = await import("./download");
    const response = await GET(
      new Request(
        "https://example.test/paid-marketing/export?store=store-1&from=2026-09-01&to=2026-09-02&channel=Meta&channel=Google",
      ),
    );
    const csv = await response.text();
    expect(response.status).toBe(200);
    expect(csv).toContain('"123456789012345678.123456789","9007199254740993"');
    expect(csv).toContain('"\'=1+1"');
    expect(csv).toContain('"live","store-1","2026-09-01","2026-09-02","","false"');
    const queries = fake.calls.filter((call) => call.kind === "submit");
    expect(queries).toHaveLength(1);
    const submitted = queries[0];
    if (!submitted) throw new Error("No campaign query submitted");
    expect(queryName(submitted)).toBe("paid_campaigns");
    expect((submitted.body as Submitted).queryParameters).toContainEqual({
      name: "channel",
      parameterType: { type: "STRING" },
      parameterValue: { value: "Meta" },
    });

    requestHeaders.current = new Headers();
    await expect(GET(new Request("https://example.test/paid-marketing/export?store=store-1"))).rejects.toThrow(
      "not signed in",
    );
    expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1);
  });

  it("marks a bounded CSV as partial and returns actionable failures", async () => {
    await goLive({
      submit: () =>
        rowsResponse(
          CAMPAIGN_FIELDS,
          Array.from({ length: 201 }, (_, i) => ({ ...CAMPAIGN_ROW, campaign_id: `c${i}` })),
          { pageToken: "more" },
        ),
    });
    const { GET } = await import("./download");
    const url = "https://example.test/paid-marketing/export?store=store-1&from=2026-09-01&to=2026-09-02";
    const partial = await GET(new Request(url));
    expect(partial.headers.get("content-disposition")).toContain("-partial-");
    const lines = (await partial.text()).trimEnd().split("\r\n");
    expect(lines).toHaveLength(201);
    expect(lines.slice(1).every((line) => line.includes(',"true",'))).toBe(true);

    await goLive({ submit: () => Response.json({ error: { errors: [{ reason: "accessDenied" }] } }, { status: 403 }) });
    const failure = await GET(new Request(url));
    expect(failure.status).toBe(503);
    expect(await failure.json()).toMatchObject({ title: expect.any(String), remedy: expect.any(String) });
    expect(failure.headers.get("content-disposition")).toBeNull();
  });

  it("runs both reads with typed parameters and decodes exact values", async () => {
    const fake = await goLive({
      submit: (call) =>
        queryName(call) === "paid_channel_daily"
          ? rowsResponse(SERIES_FIELDS, [SERIES_ROW])
          : rowsResponse(CAMPAIGN_FIELDS, [CAMPAIGN_ROW]),
    });
    const { getPaidMarketing } = await import("./queries");
    const data = await getPaidMarketing(FILTERS);
    expect(data.channelDays[0]?.impressions).toBe(9_007_199_254_740_993n);
    expect(data.campaigns[0]?.spend).toBe("123456789012345678.123456789");
    expect(data.campaignsTruncated).toBe(false);

    const campaigns = fake.calls.find((call) => call.kind === "submit" && queryName(call) === "paid_campaigns")
      ?.body as Submitted;
    expect(campaigns.query).toContain("`sm-demotenant.sm_transformed_v2.rpt_ad_performance_daily`");
    expect(campaigns.query).not.toContain("Meta");
    expect(campaigns.queryParameters).toContainEqual({
      name: "channel",
      parameterType: { type: "STRING" },
      parameterValue: { value: "Meta" },
    });
  });

  it("treats a truncated series as an error, and a truncated campaign list as a notice", async () => {
    const many = (fields: { name: string }[]) => ({
      pageToken: "more",
      rows: Array.from({ length: 2001 }, () => ({ f: fields.map(() => ({ v: "1" })) })),
    });
    await goLive({
      submit: (call) =>
        queryName(call) === "paid_channel_daily"
          ? rowsResponse(SERIES_FIELDS, [], many(SERIES_FIELDS))
          : rowsResponse(CAMPAIGN_FIELDS, [CAMPAIGN_ROW]),
    });
    const { getPaidMarketing } = await import("./queries");
    await expect(getPaidMarketing(FILTERS)).rejects.toMatchObject({ kind: "result_too_large" });

    await goLive({
      submit: (call) =>
        queryName(call) === "paid_channel_daily"
          ? rowsResponse(SERIES_FIELDS, [SERIES_ROW])
          : rowsResponse(CAMPAIGN_FIELDS, [], {
              pageToken: "more",
              rows: Array.from({ length: 201 }, (_, index) => ({
                f: CAMPAIGN_FIELDS.map((field) => ({
                  v: field.name === "campaign_id" ? `c${index}` : field.type === "STRING" ? "x" : "1",
                })),
              })),
            }),
    });
    expect((await getPaidMarketing(FILTERS)).campaignsTruncated).toBe(true);
  });
});
