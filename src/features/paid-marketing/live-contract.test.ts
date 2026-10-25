/** Paid marketing's live path end to end against the fake BigQuery. */
import { describe, expect, it, vi } from "vitest";
import type { FakeCall, SubmittedQuery } from "../../../tests/fake-bigquery/fake-bigquery";
import {
  expectEveryQueryScopedTo,
  goLive,
  isStoreList,
  requestHeaders,
  rowsResponse,
  withStores,
} from "../../../tests/helpers/live";
import { periodColumns } from "@/lib/data/period-sql";
import { MAX_SERIES_ROWS } from "./rows";

const SERIES_FIELDS = [
  { name: "platform_revenue", type: "FLOAT" },
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

const queryName = (call: FakeCall) => (call.body as SubmittedQuery).labels.sm_query;

describe("paid marketing, live", () => {
  it("keeps name scope in the series, campaigns, both comparison periods, inspection, and CSV", async () => {
    const fake = await goLive({ submit: withStores(() => rowsResponse([], [])) });
    const { getPaidMarketing, getSpendBreakdown, getPaidNames } = await import("./queries");
    const { GET } = await import("./download");
    const names = [
      { field: "ad_group" as const, operator: "starts_with" as const, values: ["US_%"] },
      { field: "ad" as const, operator: "excludes" as const, values: ["test", "draft"] },
    ];
    const filters = { ...FILTERS, names };
    await getPaidMarketing(filters);
    await getSpendBreakdown(filters, "campaign", [{ from: "2026-08-01", to: "2026-08-02" }, null]);
    await getPaidNames(filters);
    const url = new URL("https://example.test/paid-marketing/export?store=store-1&from=2026-09-01&to=2026-09-02");
    url.searchParams.set("names", JSON.stringify(names));
    expect((await GET(new Request(url))).status).toBe(200);
    const calls = fake.calls.filter((call) => call.kind === "submit" && !isStoreList(call));
    expect(calls).toHaveLength(5);
    for (const call of calls) {
      const query = call.body as SubmittedQuery;
      expect(query.query).toContain("STARTS_WITH(LOWER(ad_group_name), LOWER(@name_0_0))");
      expect(query.query).toContain("NULLIF(TRIM(ad_name), '') IS NOT NULL AND NOT (");
      expect(query.query).not.toContain("US_%");
      expect(query.queryParameters).toContainEqual({
        name: "name_0_0",
        parameterType: { type: "STRING" },
        parameterValue: { value: "US_%" },
      });
      if (query.query.includes("GROUP BY"))
        expect(query.query.indexOf("@name_0_0")).toBeLessThan(query.query.indexOf("GROUP BY"));
    }
    const before = fake.calls.length;
    url.searchParams.set("names", "invalid");
    const invalid = await GET(new Request(url));
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({ title: "Check the name filters" });
    expect(fake.calls.slice(before).filter((call) => call.kind === "submit" && !isStoreList(call))).toHaveLength(0);
  });
  it("exports through the real guard, query, and decoders, without reading the chart", async () => {
    const fake = await goLive({
      submit: withStores(
        () =>
          rowsResponse(CAMPAIGN_FIELDS, [{ ...CAMPAIGN_ROW, campaign_name: "=1+1", impressions: "9007199254740993" }]),
        ["store-1"],
        "America/New_York",
        "USD",
      ),
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
    // CSV uses the same canonical store metadata currency as the report.
    expect(csv).toContain('"live","store-1","2026-09-01","2026-09-02","USD","false"');
    const queries = fake.calls.filter((call) => call.kind === "submit" && !isStoreList(call));
    expect(queries).toHaveLength(1);
    const submitted = queries[0];
    if (!submitted) throw new Error("No campaign query submitted");
    expect(queryName(submitted)).toBe("paid_campaigns");
    expect((submitted.body as SubmittedQuery).queryParameters).toContainEqual({
      name: "channel",
      parameterType: { type: "STRING" },
      parameterValue: { value: "Meta" },
    });

    requestHeaders.current = new Headers();
    await expect(GET(new Request("https://example.test/paid-marketing/export?store=store-1"))).rejects.toThrow(
      "not signed in",
    );
    expect(fake.calls.filter((call) => call.kind === "submit" && !isStoreList(call))).toHaveLength(1);
  });

  it("marks a bounded CSV as partial and returns actionable failures", async () => {
    await goLive({
      submit: withStores(() =>
        rowsResponse(
          CAMPAIGN_FIELDS,
          Array.from({ length: 201 }, (_, i) => ({ ...CAMPAIGN_ROW, campaign_id: `c${i}` })),
          { pageToken: "more" },
        ),
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
      ?.body as SubmittedQuery;
    expect(campaigns.query).toContain("`sm-demotenant.sm_transformed_v2.rpt_ad_performance_daily`");
    expect(campaigns.query).not.toContain("Meta");
    expect(campaigns.queryParameters).toContainEqual({
      name: "channel",
      parameterType: { type: "STRING" },
      parameterValue: { value: "Meta" },
    });
  });

  it("keeps one campaign ID on two ad platforms as two campaigns", async () => {
    const fake = await goLive({
      submit: () => rowsResponse(CAMPAIGN_FIELDS, [CAMPAIGN_ROW, { ...CAMPAIGN_ROW, channel: "Google", spend: "1" }]),
    });
    const { getPaidCampaigns } = await import("./queries");
    const data = await getPaidCampaigns(FILTERS);
    expect(data.campaigns.map((campaign) => [campaign.channel, campaign.campaignId])).toEqual([
      ["Meta", "c1"],
      ["Google", "c1"],
    ]);
    const sql = fake.submitted(0).query;
    expect(sql).toContain("GROUP BY channel, campaign_id");
  });

  it("ranks only groups with selected-period spend, so comparison-only campaigns never pad the list", async () => {
    const fields = [
      "dimension_key",
      "label",
      ...periodColumns(["spend"]),
      "total_spend",
      "minimum_spend",
      ...periodColumns(["latest_date"]),
    ].map((name) => ({ name, type: name.endsWith("date") ? "DATE" : name.endsWith("spend") ? "NUMERIC" : "STRING" }));
    const row = (key: string, spend: string | null) => ({
      dimension_key: key,
      label: key,
      spend,
      previous_spend: null,
      second_spend: "5",
      total_spend: "3",
      minimum_spend: "1",
      latest_date: "2026-09-02",
      previous_latest_date: null,
      second_latest_date: "2025-09-02",
    });
    // The warehouse sorts groups without selected-period spend last (NULLS LAST).
    await goLive({ submit: () => rowsResponse(fields, [row("a", "2"), row("b", "1"), row("last-year-only", null)]) });
    const { getSpendBreakdown } = await import("./queries");
    const data = await getSpendBreakdown(FILTERS, "campaign", [null, { from: "2025-09-01", to: "2025-09-02" }]);
    expect(data.rows.map((entry) => entry.dimension_key)).toEqual(["a", "b"]);
    expect(data.hasMore).toBe(false);
  });

  it("treats a truncated series as an error, and a truncated campaign list as a notice", async () => {
    const many = (fields: { name: string }[]) => ({
      pageToken: "more",
      rows: Array.from({ length: MAX_SERIES_ROWS + 1 }, () => ({ f: fields.map(() => ({ v: "1" })) })),
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

// Exercise direct calls as well as pages: middleware cannot be the store boundary.
it("refuses another store in dispatch and live loaders before any warehouse call", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const { getPaidMarketing } = await import("./queries");
  const { queryPaidMarketing } = await import("./bigquery");
  await expect(getPaidMarketing(FILTERS)).rejects.toThrow("This store is not available");
  await expect(queryPaidMarketing(FILTERS)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

it("denies campaign downloads and their direct loaders for a different store", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const { getPaidCampaigns } = await import("./queries");
  const { queryPaidCampaigns } = await import("./bigquery");
  const { GET } = await import("./download");
  await expect(getPaidCampaigns(FILTERS)).rejects.toThrow("This store is not available");
  await expect(queryPaidCampaigns(FILTERS)).rejects.toThrow("This store is not available");
  const response = await GET(new Request("https://example.test/paid-marketing/export?store=store-1"));
  expect(response.status).toBe(403);
  expect(await response.text()).not.toContain("allowed-store");
  expect(fake.calls).toHaveLength(0);
});

it("allows the fixed store and keeps every SQL read scoped to it", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", FILTERS.storeId);
  const { getPaidMarketing } = await import("./queries");
  await getPaidMarketing(FILTERS);
  expectEveryQueryScopedTo(fake, FILTERS.storeId);
});
