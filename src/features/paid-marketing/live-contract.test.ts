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
