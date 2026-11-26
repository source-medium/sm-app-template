/** Creatives' live path end to end against the fake BigQuery. */
import { describe, expect, it, vi } from "vitest";
import { expectEveryQueryScopedTo, goLive, rowsResponse } from "../../../tests/helpers/live";
import type { BaselineRanges } from "@/lib/comparison";
import { AD_PLATFORM_SQL as PLATFORM } from "@/lib/data/channel-sql";
import { PERIOD_PREFIXES as PERIODS } from "@/lib/data/period-sql";

const FIELDS = [
  ...[
    "creative_id",
    "title",
    "body",
    "name",
    "image_url",
    "thumbnail_url",
    "video_url",
    "call_to_action",
    "channel",
  ].map((name) => ({ name, type: "STRING" })),
  ...["format", "post_url", "ad_url"].map((name) => ({ name, type: "STRING" })),
  { name: "first_date", type: "DATE" },
  ...PERIODS.flatMap((prefix) => [
    { name: `${prefix}spend`, type: "NUMERIC" },
    { name: `${prefix}impressions`, type: "INTEGER" },
    { name: `${prefix}clicks`, type: "INTEGER" },
    ...["conversions", "revenue", "roas", "cpo", "ctr"].map((name) => ({ name: `${prefix}${name}`, type: "FLOAT" })),
  ]),
  ...["latest_date", "previous_latest_date", "second_latest_date"].map((name) => ({ name, type: "DATE" })),
];
const ROW = {
  creative_id: "cr1",
  title: "Summer",
  body: null,
  name: "Summer hero",
  image_url: "javascript:alert(1)",
  video_url: null,
  thumbnail_url: "https://cdn.example.com/t.jpg",
  call_to_action: "SHOP_NOW",
  channel: "meta_ads",
  format: "video",
  post_url: "https://www.tiktok.com/@brand/video/1",
  ad_url: null,
  first_date: "2026-09-02",
  spend: "0.1",
  impressions: "9007199254740993",
  clicks: "2",
  conversions: "0.5",
  ctr: "0.02",
  previous_spend: "0.05",
  previous_roas: "1.5",
  latest_date: "2026-09-02",
  previous_latest_date: "2026-08-31",
};
const FILTERS = { storeId: "store-1", range: { from: "2026-09-01", to: "2026-09-02" } };
const NONE: BaselineRanges = [null, null];
const PREVIOUS: BaselineRanges = [{ from: "2026-08-30", to: "2026-08-31" }, null];

describe("creatives, live", () => {
  it("applies literal name predicates before creative aggregation, with the same inspection scope", async () => {
    const fake = await goLive({ submit: () => rowsResponse([], []) });
    const { getCreatives, getCreativeNames, getCreativeSummary } = await import("./queries");
    const value = "[retargeting]%_' OR TRUE --";
    const filters = {
      ...FILTERS,
      sort: "spend" as const,
      channel: "meta_ads",
      campaign: "cmp-1002",
      names: [{ field: "campaign" as const, operator: "contains" as const, values: [value] }],
    };
    await getCreatives(filters, NONE);
    await getCreativeSummary(filters, NONE);
    await getCreativeNames(filters);
    const queries = fake.submitted();
    expect(queries).toHaveLength(3);
    for (const query of queries) {
      expect(query.query).toContain("sm_store_id = @store_id");
      expect(query.query).toContain("ad_campaign_id = @campaign");
      expect(query.query).toContain(`(@channel = '' OR ${PLATFORM} = @channel)`);
      expect(query.query).not.toContain("sm_channel");
      expect(query.query).toContain("STRPOS(LOWER(ad_campaign_name), LOWER(@name_0_0)) > 0");
      expect(query.query).not.toContain(value);
      expect(query.queryParameters).toContainEqual({
        name: "name_0_0",
        parameterType: { type: "STRING" },
        parameterValue: { value },
      });
    }
    for (const index of [0, 1]) {
      const query = fake.submitted(index).query;
      expect(query.indexOf("@name_0_0")).toBeLessThan(query.indexOf("GROUP BY creative_id"));
      // A creative launches once and keeps one format across the comparison-safe lookback: no campaign, name or comparison filter.
      const launches = query.slice(query.indexOf("launches AS"), query.indexOf("grouped AS"));
      const grouped = query.slice(query.indexOf("grouped AS"), query.indexOf("scoped AS"));
      expect(launches).toContain("date BETWEEN @format_from AND @end_date");
      expect(launches).toContain("MIN(IF(date >= @lookback_from AND ad_spend > 0, date, NULL)) AS first_date");
      expect(launches).toContain(
        "ARRAY_AGG(NULLIF(TRIM(ad_creative_format), '') IGNORE NULLS ORDER BY date DESC, NULLIF(TRIM(ad_creative_format), '') DESC LIMIT 1)[SAFE_OFFSET(0)] AS format",
      );
      expect(launches).not.toContain("@campaign");
      expect(launches).not.toContain("@name_0_0");
      expect(launches).not.toContain("@compare");
      expect(grouped).not.toContain("ad_creative_format");
    }
  });

  it("reads first spend from the 365-day lookback and each format from the earliest day a comparison can start", async () => {
    const fake = await goLive({ submit: () => rowsResponse([], []) });
    const { getCreatives, getCreativeSummary } = await import("./queries");
    const leapYearRange = { from: "2025-01-01", to: "2025-01-31" };
    const leapYearYoY: BaselineRanges = [{ from: "2024-01-01", to: "2024-01-31" }, null];
    const longRange = { from: "2025-01-01", to: "2026-01-15" };
    const longPrevious: BaselineRanges = [{ from: "2023-12-18", to: "2024-12-31" }, null];

    await getCreatives({ storeId: "store-1", range: leapYearRange, sort: "spend" }, leapYearYoY);
    await getCreativeSummary({ storeId: "store-1", range: longRange, sort: "spend" }, longPrevious);

    expect(fake.submitted()).toHaveLength(2);
    // 366 days before a month, so its leap-year comparison (2024-01-01) is inside; a 380-day
    // selection's whole length before it, so its previous period (2023-12-18) is too.
    for (const [submit, formatFrom] of [
      [fake.submitted(0), "2024-01-01"],
      [fake.submitted(1), "2023-12-18"],
    ] as const) {
      const launches = submit.query.slice(submit.query.indexOf("launches AS"), submit.query.indexOf("grouped AS"));
      expect(launches).toContain("MIN(IF(date >= @lookback_from AND ad_spend > 0, date, NULL)) AS first_date");
      expect(launches).toContain("date BETWEEN @format_from AND @end_date");
      expect(launches).not.toContain("@compare");
      expect(submit.queryParameters).toContainEqual({
        name: "lookback_from",
        parameterType: { type: "DATE" },
        parameterValue: { value: "2024-01-02" },
      });
      expect(submit.queryParameters).toContainEqual({
        name: "format_from",
        parameterType: { type: "DATE" },
        parameterValue: { value: formatFrom },
      });
    }
  });

  it("sorts by a column from the fixed map, sums each period once and reads each creative's latest image", async () => {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, [ROW]) });
    const { getCreatives } = await import("./queries");
    const channel = "meta_ads' OR TRUE --";
    const campaign = "campaign' OR TRUE --";
    const data = await getCreatives({ ...FILTERS, sort: "ctr", channel, campaign, format: "video" }, PREVIOUS);
    expect(data.creatives[0]).toMatchObject({
      creativeId: "cr1",
      name: "Summer hero",
      imageUrl: "https://cdn.example.com/t.jpg",
      impressions: 9_007_199_254_740_993n,
      format: "video",
      firstSpend: { when: "launched", date: "2026-09-02" },
      adUrl: "https://www.tiktok.com/@brand/video/1",
    });
    expect(data.creatives[0]?.baselines[0]).toMatchObject({ spend: "0.05", roas: 1.5 });
    expect(data.coverage).toEqual({
      latest_date: "2026-09-02",
      previous_latest_date: "2026-08-31",
      second_latest_date: null,
    });
    expect(data.truncated).toBe(false);

    const submit = fake.submitted(0);
    expect(submit.query).toContain("ORDER BY ctr DESC NULLS LAST, creative_id");
    expect(submit.query).toContain(`${PLATFORM} AS channel`);
    expect(submit.query).toContain("GROUP BY creative_id, channel");
    expect(submit.query).toContain(`(@channel = '' OR ${PLATFORM} = @channel)`);
    expect(submit.query).toContain("WHERE @format = '' OR format = @format");
    expect(submit.query).not.toContain("sm_channel");
    expect(submit.query).not.toContain(channel);
    expect(submit.query).not.toContain(campaign);
    // Each period's sums once, then ratios of those sums.
    expect(submit.query).toContain(
      "SUM(IF(@compare AND date BETWEEN @baseline_from AND @baseline_to, ad_spend, NULL)) AS previous_spend",
    );
    expect(submit.query).toContain("SAFE_DIVIDE(revenue, spend) AS roas");
    expect(submit.query).toContain("SAFE_DIVIDE(previous_spend, previous_conversions) AS previous_cpo");
    for (const column of [
      // Cards show the display-size copy, falling back to the image where a month predates the column.
      "COALESCE(ad_creative_display_image_url, ad_creative_image_url)",
      "ad_creative_thumbnail_url",
      "ad_creative_video_url",
      "ad_creative_post_url",
    ]) {
      const guarded = `IF(STARTS_WITH(${column}, 'https://'), ${column}, NULL)`;
      expect(submit.query).toContain(
        `ARRAY_AGG(${guarded} IGNORE NULLS ORDER BY date DESC, ${guarded} DESC LIMIT 1)[SAFE_OFFSET(0)]`,
      );
    }
    const adUrlExpr =
      "COALESCE(IF(STARTS_WITH(ad_creative_facebook_url, 'https://'), ad_creative_facebook_url, NULL), IF(STARTS_WITH(ad_creative_instagram_url, 'https://'), ad_creative_instagram_url, NULL))";
    expect(submit.query).toContain(
      `ARRAY_AGG(${adUrlExpr} IGNORE NULLS ORDER BY date DESC, ${adUrlExpr} DESC LIMIT 1)[SAFE_OFFSET(0)] AS ad_url`,
    );
    expect(submit.query).toContain(
      "ARRAY_AGG(ad_creative_name IGNORE NULLS ORDER BY date DESC, ad_creative_name DESC LIMIT 1)[SAFE_OFFSET(0)] AS name",
    );
    expect(submit.queryParameters).toContainEqual({
      name: "lookback_from",
      parameterType: { type: "DATE" },
      parameterValue: { value: "2025-09-01" },
    });
    expect(submit.queryParameters).toContainEqual({
      name: "compare",
      parameterType: { type: "BOOL" },
      parameterValue: { value: "true" },
    });
    for (const [name, value] of [
      ["campaign", campaign],
      ["channel", channel],
      ["format", "video"],
    ])
      expect(submit.queryParameters).toContainEqual({
        name,
        parameterType: { type: "STRING" },
        parameterValue: { value },
      });
  });

  it("reports more creatives than the grid holds as truncation", async () => {
    await goLive({
      submit: () =>
        rowsResponse(FIELDS, [], {
          pageToken: "more",
          rows: Array.from({ length: 49 }, (_, index) => ({
            f: FIELDS.map((field) => ({
              v:
                field.name === "creative_id"
                  ? `cr${index}`
                  : field.name === "channel"
                    ? "meta_ads"
                    : field.type === "STRING" || field.type === "DATE"
                      ? null
                      : "1",
            })),
          })),
        }),
    });
    const { getCreatives } = await import("./queries");
    const data = await getCreatives({ ...FILTERS, sort: "spend" }, NONE);
    expect(data.creatives).toHaveLength(48);
    expect(data.truncated).toBe(true);
  });

  it("looks up current assets for the ranked platform and creative together without filtering out delivery", async () => {
    const rankings = [
      { ...ROW, channel: "meta_ads", creative_id: "shared" },
      { ...ROW, channel: "google_ads", creative_id: "shared" },
      { ...ROW, channel: "impact", creative_id: "historical" },
    ];
    const fields = ["channel", "creative_id", "kind", "src", "poster"].map((name) => ({ name, type: "STRING" }));
    const fake = await goLive({
      submit: (call) => {
        if (String((call.body as { query: string }).query).includes("rpt_ad_creative_assets")) {
          return rowsResponse(fields, [
            {
              channel: "meta_ads",
              creative_id: "shared",
              kind: "video",
              src: "https://example.com/clip.mp4",
              poster: null,
            },
            {
              channel: "meta_ads",
              creative_id: "shared",
              kind: "image",
              src: "https://cdn.example.com/t.jpg",
              poster: null,
            },
            { channel: "google_ads", creative_id: null, kind: null, src: null, poster: null },
          ]);
        }
        return rowsResponse(FIELDS, rankings);
      },
    });
    const { getCreatives } = await import("./queries");
    const result = await getCreatives({ ...FILTERS, sort: "spend" }, NONE);
    expect(result.creatives[0]?.media).toEqual([
      { kind: "image", src: "https://cdn.example.com/t.jpg" },
      { kind: "video", src: "https://example.com/clip.mp4", poster: null },
    ]);
    expect(result.creatives.map((c) => c.assets)).toEqual(["available", "no_match", "no_platform_inventory"]);
    expectEveryQueryScopedTo(fake, FILTERS.storeId);
    expect(fake.submitted()).toHaveLength(2);
    // Inventory rows match the ranking by the same platform key, so an aliased platform finds its assets.
    expect(fake.submitted(1).query).toContain(`${PLATFORM} AS channel`);
    expect(fake.submitted(1).query).toContain(`requested.channel = ${PLATFORM}`);
    // Previews show each image at display size.
    expect(fake.submitted(1).query).toContain("asset_display_image_url AS asset_image_url");
    expect(fake.submitted(1).queryParameters).toContainEqual({
      name: "identities",
      parameterType: { type: "STRING" },
      parameterValue: { value: JSON.stringify(rankings.map((r) => [r.channel, r.creative_id])) },
    });
  });

  it("keeps the ranking when the separate inventory read fails", async () => {
    await goLive({
      submit: (call) =>
        String((call.body as { query: string }).query).includes("rpt_ad_creative_assets")
          ? Response.json({ error: { code: 404, message: "Missing table" } }, { status: 404 })
          : rowsResponse(FIELDS, [{ ...ROW, image_url: "/api/internal", thumbnail_url: "/sample-creatives/x.svg" }]),
    });
    const { getCreatives } = await import("./queries");
    const data = await getCreatives({ ...FILTERS, sort: "spend" }, NONE);
    expect(data.creatives[0]).toMatchObject({ creativeId: "cr1", assets: "unknown", imageUrl: null, media: [] });
  });

  it("totals the scope, each format and each launch week in one grouped pass", async () => {
    const SUMMARY_FIELDS = [
      { name: "kind", type: "STRING" },
      { name: "has_creative", type: "BOOLEAN" },
      { name: "format", type: "STRING" },
      { name: "launch_week", type: "DATE" },
      ...PERIODS.flatMap((prefix) => [
        { name: `${prefix}spend`, type: "NUMERIC" },
        { name: `${prefix}impressions`, type: "INTEGER" },
        { name: `${prefix}clicks`, type: "INTEGER" },
        { name: `${prefix}conversions`, type: "FLOAT" },
        { name: `${prefix}revenue`, type: "FLOAT" },
        { name: `${prefix}creatives`, type: "INTEGER" },
      ]),
      { name: "new_creatives", type: "INTEGER" },
      ...["latest_date", "previous_latest_date", "second_latest_date"].map((name) => ({ name, type: "DATE" })),
    ];
    const fake = await goLive({
      submit: () =>
        rowsResponse(SUMMARY_FIELDS, [
          {
            kind: "total",
            has_creative: "true",
            spend: "100",
            previous_spend: "80",
            creatives: "6",
            new_creatives: "2",
            latest_date: "2026-09-02",
          },
          { kind: "total", has_creative: "false", spend: "5" },
          { kind: "format", has_creative: "true", format: "video", spend: "60", creatives: "3" },
          { kind: "format", has_creative: "false", spend: "5" },
          { kind: "launch", has_creative: "true", launch_week: null, spend: "75", creatives: "4" },
          { kind: "launch", has_creative: "true", launch_week: "2026-08-31", spend: "25", creatives: "2" },
          { kind: "launch", has_creative: "true", launch_week: "2026-08-24" },
        ]),
    });
    const { getCreativeSummary } = await import("./queries");
    const summary = await getCreativeSummary({ ...FILTERS, sort: "spend", minimumSpend: "10" }, PREVIOUS);
    expect(summary.totals?.current).toMatchObject({ spend: "100", creatives: 6n });
    expect(summary.totals?.baselines[0].spend).toBe("80");
    expect(summary).toMatchObject({ newCreatives: 2n, uncoveredSpend: "5" });
    expect(summary.formats).toHaveLength(1);
    // A launch week with no selected-period spend is not listed.
    expect(summary.launches.map((row) => row.week)).toEqual([null, "2026-08-31"]);
    const query = fake.submitted(0).query;
    expect(query).toContain(
      "GROUP BY GROUPING SETS ((has_creative), (has_creative, format), (has_creative, launch_week))",
    );
    expect(query).toContain("DATE_TRUNC(first_date, WEEK(MONDAY))");
    // Minimums and sorting shape the list only, never the totals.
    expect(query).not.toContain("@minimum_spend");
    // Delivery without a creative identity stays in the totals, as its own group.
    expect(query.slice(query.indexOf("grouped AS"), query.indexOf("scoped AS"))).not.toContain(
      "ad_creative_id IS NOT NULL",
    );
  });
});

// Exercise direct calls as well as pages: middleware cannot be the store boundary.
it("refuses another store in dispatch and live loaders before any warehouse call", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const { getCreativeChannels, getCreatives, getCreativeSummary } = await import("./queries");
  const { queryCreativeChannels, queryCreatives, queryCreativeSummary } = await import("./bigquery");
  await expect(getCreatives({ ...FILTERS, sort: "spend" }, NONE)).rejects.toThrow("This store is not available");
  await expect(queryCreatives({ ...FILTERS, sort: "spend" }, NONE)).rejects.toThrow("This store is not available");
  await expect(getCreativeSummary({ ...FILTERS, sort: "spend" }, NONE)).rejects.toThrow("This store is not available");
  await expect(queryCreativeSummary({ ...FILTERS, sort: "spend" }, NONE)).rejects.toThrow(
    "This store is not available",
  );
  await expect(getCreativeChannels(FILTERS)).rejects.toThrow("This store is not available");
  await expect(queryCreativeChannels(FILTERS)).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

it("allows the fixed store and keeps every SQL read scoped to it", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", FILTERS.storeId);
  const { getCreatives, getCreativeSummary } = await import("./queries");
  await getCreatives({ ...FILTERS, sort: "spend" }, NONE);
  await getCreativeSummary({ ...FILTERS, sort: "spend" }, NONE);
  expectEveryQueryScopedTo(fake, FILTERS.storeId);
  // Both relation reads in each query (launches and delivery) carry the store predicate.
  for (const body of fake.submitted()) expect(body.query.match(/sm_store_id = @store_id/g)).toHaveLength(2);
});

it("lists channels before the creative cap and rejects a truncated roster", async () => {
  let truncate = false;
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        [{ name: "channel", type: "STRING" }],
        truncate
          ? Array.from({ length: 50 }, (_, i) => ({ channel: String(i) }))
          : [{ channel: "meta_ads" }, { channel: "google_ads" }],
        truncate ? { pageToken: "more" } : {},
      ),
  });
  const { getCreativeChannels } = await import("./queries");
  expect(await getCreativeChannels(FILTERS)).toEqual(["meta_ads", "google_ads"]);
  const body = fake.submitted(0);
  expect(body.query).toContain(`SELECT DISTINCT ${PLATFORM} AS channel`);
  expect(body.query).not.toContain("sm_channel");
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
  await getCreatives(
    {
      ...FILTERS,
      sort: "cpo",
      minimumSpend: "0.1",
      minimumConversions: "0.25",
      selection: [
        ["meta_ads", "outside-top-list"],
        ["google_ads", "outside-top-list"],
      ],
    },
    NONE,
  );
  const query = fake.submitted(0);
  const sql = query.query;
  // Thresholds and the selection apply after aggregation and after coverage is taken across the whole scope.
  expect(sql.indexOf("GROUP BY creative_id")).toBeLessThan(sql.indexOf("MAX(group_latest_date) OVER ()"));
  expect(sql.indexOf("MAX(group_latest_date) OVER ()")).toBeLessThan(sql.indexOf("SELECT * FROM scoped"));
  for (const predicate of ["@minimum_spend", "@minimum_conversions", "@selection"]) {
    expect(sql.slice(0, sql.indexOf("SELECT * FROM scoped"))).not.toContain(predicate);
    expect(sql.indexOf(predicate)).toBeLessThan(sql.indexOf("ORDER BY cpo"));
  }
  expect(query.query).toContain("ORDER BY cpo ASC NULLS LAST");
  expect(query.query).toContain("CAST(NULLIF(@minimum_spend, '') AS NUMERIC)");
  expect(query.query).toContain("CAST(NULLIF(@minimum_conversions, '') AS FLOAT64)");
  expect(query.query).toContain("channel = JSON_VALUE(selected, '$[0]')");
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
    getCreatives(
      { ...FILTERS, sort: "spend", selection: Array.from({ length: 5 }, (_, i) => ["meta_ads", String(i)] as const) },
      NONE,
    ),
  ).rejects.toThrow("Invalid creative selection");
});

it("loads current assets independently of spend, scoped by store, platform and creative with stable pagination", async () => {
  const { ASSET_PAGE_SIZE } = await import("./assets");
  const row = {
    sm_ad_creative_asset_key: "001",
    source_system: "meta_ads",
    ad_creative_id: "shared",
    ad_id: null,
    ad_campaign_id: null,
    asset_role: "video",
    asset_pinned_position: "known",
    asset_performance_label: "known",
    asset_status: "known",
    asset_id: null,
    asset_text: null,
    asset_image_url: "javascript:bad",
    asset_display_image_url: "https://storage.googleapis.com/mirror/cover.webp",
    asset_video_url: "https://cdn.example.com/movie.mp4",
    asset_video_id: "video1",
    asset_link_url: "https://user:pass@example.com",
  };
  const fields = Object.keys(row).map((name) => ({ name, type: "STRING" }));
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        fields,
        Array.from({ length: ASSET_PAGE_SIZE + 1 }, (_, index) => ({
          ...row,
          sm_ad_creative_asset_key: String(index + 101),
        })),
      ),
  });
  const { getCreativeAssets } = await import("./queries");
  const scope = { storeId: FILTERS.storeId, channel: "meta_ads", entity: "shared", role: "video", cursor: "100" };
  const page = await getCreativeAssets(scope, FILTERS.range.to);
  expect(page.truncated).toBe(true);
  expect(page.rows).toHaveLength(ASSET_PAGE_SIZE);
  expect(page.rows[0]).toMatchObject({
    asset_image_url: null,
    asset_display_image_url: row.asset_display_image_url,
    asset_link_url: null,
    asset_video_id: "video1",
    asset_video_url: row.asset_video_url,
  });
  expectEveryQueryScopedTo(fake, FILTERS.storeId);
  const query = fake.submitted(0);
  expect(query.query).toContain("rpt_ad_creative_assets");
  expect(query.query).not.toContain("rpt_ad_performance_daily");
  for (const [name, value] of Object.entries({
    channel: scope.channel,
    entity: scope.entity,
    role: scope.role,
    cursor: scope.cursor,
  })) {
    expect(query.queryParameters).toContainEqual({
      name,
      parameterType: { type: "STRING" },
      parameterValue: { value },
    });
  }
  expect(query.query).toContain(`(@channel = '' OR ${PLATFORM} = @channel)`);
  expect(query.query).toContain("ad_creative_id = @entity");
  expect(query.query).toContain("asset_role = @role");
  expect(query.query).toContain("sm_ad_creative_asset_key > @cursor");
});
