/** Creatives' live path end to end against the fake BigQuery. */
import { describe, expect, it, vi } from "vitest";
import { expectEveryQueryScopedTo, goLive, rowsResponse } from "../../../tests/helpers/live";

const FIELDS = [
  ...["revenue", "roas", "cpo"].map((name) => ({ name, type: "FLOAT" })),
  { name: "ad_url", type: "STRING" },
  { name: "creative_id", type: "STRING" },
  { name: "title", type: "STRING" },
  { name: "body", type: "STRING" },
  { name: "image_url", type: "STRING" },
  { name: "thumbnail_url", type: "STRING" },
  { name: "call_to_action", type: "STRING" },
  { name: "channel", type: "STRING" },
  { name: "spend", type: "NUMERIC" },
  { name: "impressions", type: "INTEGER" },
  { name: "clicks", type: "INTEGER" },
  { name: "conversions", type: "FLOAT" },
  { name: "ctr", type: "FLOAT" },
];
const ROW = {
  creative_id: "cr1",
  title: "Summer",
  body: null,
  image_url: "javascript:alert(1)",
  thumbnail_url: "https://cdn.example.com/t.jpg",
  call_to_action: "SHOP_NOW",
  channel: "Meta",
  spend: "0.1",
  impressions: "9007199254740993",
  clicks: "2",
  conversions: "0.5",
  ctr: "0.02",
};
const FILTERS = { storeId: "store-1", range: { from: "2026-09-01", to: "2026-09-02" } };

describe("creatives, live", () => {
  it("applies literal name predicates before creative aggregation, with the same inspection scope", async () => {
    const fake = await goLive({ submit: () => rowsResponse([], []) });
    const { getCreatives, getCreativeNames } = await import("./queries");
    const value = "[retargeting]%_' OR TRUE --";
    const filters = {
      ...FILTERS,
      sort: "spend" as const,
      channel: "Meta",
      campaign: "cmp-1002",
      names: [{ field: "campaign" as const, operator: "contains" as const, values: [value] }],
    };
    await getCreatives(filters);
    await getCreativeNames(filters);
    const queries = fake.submitted();
    expect(queries).toHaveLength(2);
    for (const query of queries) {
      expect(query.query).toContain("sm_store_id = @store_id");
      expect(query.query).toContain("ad_creative_id IS NOT NULL");
      expect(query.query).toContain("ad_campaign_id = @campaign");
      expect(query.query).toContain("STRPOS(LOWER(ad_campaign_name), LOWER(@name_0_0)) > 0");
      expect(query.query).not.toContain(value);
      expect(query.queryParameters).toContainEqual({
        name: "name_0_0",
        parameterType: { type: "STRING" },
        parameterValue: { value },
      });
    }
    const query = fake.submitted(0).query;
    expect(query.indexOf("@name_0_0")).toBeLessThan(query.indexOf("GROUP BY creative_id"));
  });
  it("sorts by a column from the fixed map and takes each creative's latest image", async () => {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, [ROW]) });
    const { getCreatives } = await import("./queries");
    const channel = "Meta' OR TRUE --";
    const campaign = "campaign' OR TRUE --";
    const data = await getCreatives({ ...FILTERS, sort: "ctr", channel, campaign });
    expect(data.creatives[0]).toMatchObject({
      creativeId: "cr1",
      imageUrl: "https://cdn.example.com/t.jpg",
      impressions: 9_007_199_254_740_993n,
    });
    expect(data.truncated).toBe(false);

    const submit = fake.submitted(0);
    expect(submit.query).toContain("ORDER BY ctr DESC NULLS LAST, creative_id");
    expect(submit.query).toContain("GROUP BY creative_id, channel");
    expect(submit.query).toContain("(@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)");
    expect(submit.query).not.toContain(channel);
    expect(submit.query).not.toContain(campaign);
    expect(submit.query).toContain("SAFE_DIVIDE(SUM(ad_platform_reported_revenue), SUM(ad_spend)) AS roas");
    expect(submit.query).toContain("SAFE_DIVIDE(SUM(ad_spend), SUM(ad_platform_reported_conversions)) AS cpo");
    expect(submit.queryParameters).toContainEqual({
      name: "campaign",
      parameterType: { type: "STRING" },
      parameterValue: { value: campaign },
    });
    expect(submit.queryParameters).toContainEqual({
      name: "channel",
      parameterType: { type: "STRING" },
      parameterValue: { value: channel },
    });
    expect(submit.query).toContain("ARRAY_AGG(ad_creative_image_url IGNORE NULLS ORDER BY date DESC LIMIT 1)");
    expect(submit.queryParameters.map((parameter) => parameter.name)).toEqual([
      "store_id",
      "start_date",
      "end_date",
      "channel",
      "campaign",
      "limit",
      "minimum_spend",
      "minimum_conversions",
      "selection",
    ]);
  });

  it("reports more creatives than the grid holds as truncation", async () => {
    await goLive({
      submit: () =>
        rowsResponse(FIELDS, [], {
          pageToken: "more",
          rows: Array.from({ length: 49 }, (_, index) => ({
            f: FIELDS.map((field) => ({
              v: field.name === "creative_id" ? `cr${index}` : field.type === "STRING" ? null : "1",
            })),
          })),
        }),
    });
    const { getCreatives } = await import("./queries");
    const data = await getCreatives({ ...FILTERS, sort: "spend" });
    expect(data.creatives).toHaveLength(48);
    expect(data.truncated).toBe(true);
  });
});

// Exercise direct calls as well as pages: middleware cannot be the store boundary.
it("refuses another store in dispatch and live loaders before any warehouse call", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const { getCreativeChannels, getCreatives } = await import("./queries");
  const { queryCreativeChannels, queryCreatives } = await import("./bigquery");
  await expect(getCreatives({ ...FILTERS, sort: "spend" })).rejects.toThrow("This store is not available");
  await expect(queryCreatives({ ...FILTERS, sort: "spend" })).rejects.toThrow("This store is not available");
  await expect(getCreativeChannels(FILTERS)).rejects.toThrow("This store is not available");
  await expect(queryCreativeChannels(FILTERS)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

it("allows the fixed store and keeps every SQL read scoped to it", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", FILTERS.storeId);
  const { getCreatives } = await import("./queries");
  await getCreatives({ ...FILTERS, sort: "spend" });
  expectEveryQueryScopedTo(fake, FILTERS.storeId);
});

it("lists channels before the creative cap and rejects a truncated roster", async () => {
  let truncate = false;
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        [{ name: "channel", type: "STRING" }],
        truncate
          ? Array.from({ length: 50 }, (_, i) => ({ channel: String(i) }))
          : [{ channel: "Meta" }, { channel: "Google" }],
        truncate ? { pageToken: "more" } : {},
      ),
  });
  const { getCreativeChannels } = await import("./queries");
  expect(await getCreativeChannels(FILTERS)).toEqual(["Meta", "Google"]);
  const body = fake.submitted(0);
  expect(body.query).toContain("sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date");
  expect(body.query).toContain("ad_creative_id IS NOT NULL");
  expect(body.query).not.toContain("@channel");
  truncate = true;
  await expect(getCreativeChannels(FILTERS)).rejects.toMatchObject({ kind: "result_too_large" });
});

it("bounds matching-name inspection and guards its shared live read", async () => {
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        ["campaign", "ad_group", "ad"].map((name) => ({ name, type: "STRING" })),
        Array.from({ length: 51 }, (_, i) => ({ campaign: `Campaign ${i}`, ad_group: null, ad: "Ad" })),
      ),
  });
  const { queryAdNameMatches } = await import("@/lib/data/ad-name-matches.server");
  const result = await queryAdNameMatches(FILTERS, true);
  expect(result.rows).toHaveLength(50);
  expect(result.truncated).toBe(true);
  expect(result.rows[0]).toEqual({ campaign: "Campaign 0", ad_group: null, ad: "Ad" });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const before = fake.calls.length;
  await expect(queryAdNameMatches(FILTERS, true)).rejects.toThrow("This store is not available in this app.");
  expect(fake.calls).toHaveLength(before);
});

it("applies fractional thresholds after aggregation before ranking, and fetches bounded selected identities independently", async () => {
  const fake = await goLive({ submit: () => rowsResponse(FIELDS, [ROW]) });
  const { getCreatives } = await import("./queries");
  await getCreatives({
    ...FILTERS,
    sort: "cpo",
    minimumSpend: "0.1",
    minimumConversions: "0.25",
    selection: [
      ["Meta", "outside-top-list"],
      ["Google", "outside-top-list"],
    ],
  });
  const query = fake.submitted(0);
  expect(query.query.indexOf("GROUP BY creative_id")).toBeLessThan(query.query.indexOf("HAVING"));
  expect(query.query.indexOf("HAVING")).toBeLessThan(query.query.indexOf("ORDER BY cpo"));
  expect(query.query).toContain("ORDER BY cpo ASC NULLS LAST");
  expect(query.query).toContain("CAST(NULLIF(@minimum_spend, '') AS NUMERIC)");
  expect(query.query).toContain("CAST(NULLIF(@minimum_conversions, '') AS FLOAT64)");
  expect(query.query).toContain("JSON_VALUE(selected, '$[0]')");
  expect(query.query).toContain("JSON_VALUE(selected, '$[1]')");
  expect(query.query).not.toContain("outside-top-list");
  expect(query.queryParameters).toContainEqual({
    name: "limit",
    parameterType: { type: "INT64" },
    parameterValue: { value: "5" },
  });
  expect(query.queryParameters).toContainEqual({
    name: "minimum_conversions",
    parameterType: { type: "STRING" },
    parameterValue: { value: "0.25" },
  });
  await expect(
    getCreatives({
      ...FILTERS,
      sort: "spend",
      selection: Array.from({ length: 5 }, (_, i) => ["Meta", String(i)] as const),
    }),
  ).rejects.toThrow("Invalid creative selection");
});
