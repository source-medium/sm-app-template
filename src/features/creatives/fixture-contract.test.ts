import { describe, expect, it } from "vitest";
import { CreativeRow, firstSpend, lookbackStart, toCreative, safeAdUrl } from "./rows";
import { sampleCreatives as sample, sampleCreativeSummary } from "./sample";
import { samplePaidSummary } from "@/features/paid-marketing/sample";
import { sumDecimals } from "@/lib/data/decimal";
import type { CreativesFilters } from "./queries";
import type { BaselineRanges } from "@/lib/comparison";

const sampleCreatives = (filters: CreativesFilters) => sample(filters, [null, null]);

const FILTERS = { storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-28" } };

it("only links to HTTPS platform posts and scopes campaign returns before sorting", async () => {
  expect(safeAdUrl("https://www.instagram.com/p/post/")).toBe("https://www.instagram.com/p/post/");
  for (const value of [
    "javascript:alert(1)",
    "https://facebook.com.evil.test/post",
    "https://evil.test/facebook.com",
    "https://user:pass@facebook.com/post",
    "http://facebook.com/post",
  ])
    expect(safeAdUrl(value)).toBeNull();
  const data = await sampleCreatives({ ...FILTERS, sort: "cpo", channel: "meta_ads", campaign: "cmp-1001" });
  expect(data.creatives.map((c) => c.creativeId).sort()).toEqual(["crv-01", "crv-02", "crv-07"]);
  const values = data.creatives.map((c) => c.cpo ?? Number.POSITIVE_INFINITY);
  expect(values).toEqual([...values].sort((a, b) => a - b));
  for (const c of data.creatives) {
    if (c.revenue === null || c.conversions === null) throw new Error("Missing sample returns");
    expect(c.roas).toBeCloseTo(c.revenue / Number(c.spend));
    expect(c.cpo).toBeCloseTo(Number(c.spend) / c.conversions);
  }
  expect((await sampleCreatives({ ...FILTERS, sort: "spend", campaign: "unknown" })).creatives).toEqual([]);
});

describe("creatives fixture contract", () => {
  it("a reused creative includes only its matching campaign's delivery", async () => {
    const all = await sampleCreatives({ ...FILTERS, sort: "spend" });
    const filtered = await sampleCreatives({
      ...FILTERS,
      sort: "spend",
      names: [{ field: "campaign", operator: "contains", values: ["[retargeting]"] }],
    });
    const byCampaign = await sampleCreatives({ ...FILTERS, sort: "spend", campaign: "cmp-1002" });
    expect(filtered).toEqual(byCampaign);
    const reused = filtered.creatives.find((row) => row.creativeId === "crv-01");
    const prospecting = (await sampleCreatives({ ...FILTERS, sort: "spend", campaign: "cmp-1001" })).creatives.find(
      (row) => row.creativeId === "crv-01",
    );
    const total = all.creatives.find((row) => row.creativeId === "crv-01");
    expect(reused).toBeDefined();
    expect(Number(reused?.spend)).toBeLessThan(Number(total?.spend));
    expect(sumDecimals([reused?.spend ?? null, prospecting?.spend ?? null])).toBe(total?.spend);
  });
  it("decodes through the live row schema, sorted by the chosen measure", async () => {
    for (const sort of ["spend", "impressions", "clicks", "conversions", "ctr"] as const) {
      const { creatives } = await sampleCreatives({ ...FILTERS, sort });
      expect(creatives.length).toBeGreaterThan(0);
      const values = creatives.map((creative) => Number(creative[sort] ?? -1));
      expect(values).toEqual([...values].sort((a, b) => b - a));
    }
  });

  it("references no external image host in sample mode", async () => {
    const { creatives } = await sampleCreatives({ ...FILTERS, sort: "impressions" });
    for (const creative of creatives) {
      if (creative.imageUrl) expect(creative.imageUrl.startsWith("/sample-creatives/")).toBe(true);
    }
    expect(creatives.some((creative) => creative.imageUrl === null)).toBe(true);
    expect(creatives.some((creative) => creative.imageUrl?.includes("expired-link"))).toBe(true);
  });

  it("only renders https or same-origin images; anything else becomes a text card", () => {
    const period = (prefix: string) => ({
      [`${prefix}spend`]: "1.5",
      [`${prefix}impressions`]: "1",
      [`${prefix}clicks`]: "0",
      [`${prefix}conversions`]: "0",
      [`${prefix}ctr`]: "0",
      [`${prefix}revenue`]: "0",
      [`${prefix}roas`]: "0",
      [`${prefix}cpo`]: null,
    });
    const base = {
      creative_id: "c1",
      title: "t",
      body: "b",
      name: null,
      thumbnail_url: null,
      video_url: null,
      call_to_action: null,
      channel: "meta_ads",
      format: "image",
      post_url: null,
      ad_url: null,
      first_date: null,
      ...period(""),
      ...period("previous_"),
      ...period("second_"),
      latest_date: null,
      previous_latest_date: null,
      second_latest_date: null,
    };
    const urlFor = (image: string | null) =>
      toCreative(CreativeRow.parse({ ...base, image_url: image }), FILTERS.range).imageUrl;
    expect(urlFor("https://scontent.xx.fbcdn.net/v/t45/abc.jpg?stp=dst")).toBe(
      "https://scontent.xx.fbcdn.net/v/t45/abc.jpg?stp=dst",
    );
    expect(urlFor("http://insecure.example/a.jpg")).toBeNull();
    expect(urlFor("javascript:alert(1)")).toBeNull();
    expect(urlFor("data:image/svg+xml;base64,AAAA")).toBeNull();
    expect(urlFor("//evil.example/a.jpg")).toBeNull();
  });
});

it("filters ad platforms before sorting and does not silently substitute unknown platforms", async () => {
  const { sampleCreativeChannels } = await import("./sample");
  expect(sampleCreativeChannels(FILTERS)).toEqual(["google_ads", "meta_ads", "tiktok_ads"]);
  const google = await sampleCreatives({ ...FILTERS, sort: "spend", channel: "google_ads" });
  expect(google.creatives.length).toBeGreaterThan(0);
  expect(google.creatives.every((row) => row.channel === "google_ads")).toBe(true);
  expect((await sampleCreatives({ ...FILTERS, sort: "ctr", channel: "unknown" })).creatives).toEqual([]);
});

describe("creative comparisons, launches and summary", () => {
  const RANGE = { from: "2026-09-29", to: "2026-10-26" };
  const PREVIOUS = { from: "2026-09-01", to: "2026-09-28" };
  const scope = { storeId: "sample-store-a", range: RANGE, sort: "spend" as const };

  it("reads a creative's comparison values as its own delivery in the comparison dates", async () => {
    const compared = await sample(scope, [PREVIOUS, null]);
    const earlier = await sample({ ...scope, range: PREVIOUS }, [null, null]);
    for (const creative of compared.creatives) {
      const before = earlier.creatives.find((row) => row.creativeId === creative.creativeId);
      expect(creative.baselines[0].spend).toBe(before?.spend ?? null);
      expect(creative.baselines[1].spend).toBeNull();
    }
    expect(compared.coverage).toEqual({
      latest_date: RANGE.to,
      previous_latest_date: PREVIOUS.to,
      second_latest_date: null,
    });
  });

  it("marks creatives whose first spend falls in the range as new, and evergreen ones as running before", async () => {
    const { creatives } = await sample(scope, [null, null]);
    const launched = creatives.filter((creative) => creative.firstSpend?.when === "launched");
    expect(launched.length).toBeGreaterThan(0);
    for (const { firstSpend: first } of launched)
      expect(first?.when === "launched" && first.date >= RANGE.from).toBe(true);
    // Already spending on the lookback's first day: older than the lookback, never a dated launch.
    const tote = creatives.find((creative) => creative.creativeId === "crv-01");
    expect(tote?.firstSpend).toEqual({ when: "older" });
  });

  it("totals every creative in scope, not just the listed ones, and splits them by format and launch", async () => {
    const summary = await sampleCreativeSummary(scope, [PREVIOUS, null]);
    const { creatives } = await sample(scope, [PREVIOUS, null]);
    expect(summary.totals?.current.spend).toBe(sumDecimals(creatives.map((creative) => creative.spend)));
    expect(summary.totals?.current.creatives).toBe(BigInt(creatives.length));
    expect(sumDecimals(summary.formats.map((row) => row.current.spend))).toBe(summary.totals?.current.spend);
    expect(sumDecimals(summary.launches.map((row) => row.spend))).toBe(summary.totals?.current.spend);
    expect(summary.newCreatives).toBe(
      BigInt(creatives.filter((creative) => creative.firstSpend?.when === "launched").length),
    );
    // Minimums shape the list only.
    expect(await sampleCreativeSummary({ ...scope, minimumSpend: "999999" }, [PREVIOUS, null])).toEqual(summary);
  });

  it("adds up, with the spend no creative ran, to Paid marketing's totals over the same scope", async () => {
    const names = [{ field: "campaign" as const, operator: "contains" as const, values: ["[retargeting]"] }];
    for (const filters of [scope, { ...scope, channel: "meta_ads" }, { ...scope, names }]) {
      const { totals, uncoveredSpend } = await sampleCreativeSummary(filters, [PREVIOUS, null]);
      const paid = await samplePaidSummary({ channel: null, ...filters }, [PREVIOUS, null]);
      expect(sumDecimals([totals?.current.spend ?? null, uncoveredSpend])).toBe(paid.totals?.current.spend);
    }
    // Every Meta ad runs a creative, so there the whole delivery is the creatives'.
    const meta = { ...scope, channel: "meta_ads" };
    const { totals, uncoveredSpend } = await sampleCreativeSummary(meta, [PREVIOUS, null]);
    const paid = await samplePaidSummary(meta, [PREVIOUS, null]);
    expect(uncoveredSpend).toBeNull();
    for (const [creatives, all] of [
      [totals?.current, paid.totals?.current],
      [totals?.baselines[0], paid.totals?.baselines[0]],
    ] as const) {
      expect(creatives?.spend).toBe(all?.spend);
      expect(creatives?.impressions).toBe(all?.impressions);
      expect(creatives?.clicks).toBe(all?.clicks);
      expect(creatives?.conversions).toBeCloseTo(all?.conversions ?? Number.NaN, 6);
      expect(creatives?.revenue).toBeCloseTo(all?.revenue ?? Number.NaN, 6);
    }
    // Performance Max and Pinterest Shopping run no creative in the sample, so some spend is uncovered.
    expect(Number((await sampleCreativeSummary(scope, [null, null])).uncoveredSpend)).toBeGreaterThan(0);
  });

  it("scopes the whole report to one format", async () => {
    const videos = await sample({ ...scope, format: "video" }, [null, null]);
    expect(videos.creatives.length).toBeGreaterThan(0);
    expect(videos.creatives.every((creative) => creative.format === "video")).toBe(true);
    const summary = await sampleCreativeSummary({ ...scope, format: "video" }, [null, null]);
    expect(summary.formats.map((row) => row.format)).toEqual(["video"]);
    expect(summary.totals?.current.spend).toBe(sumDecimals(videos.creatives.map((creative) => creative.spend)));
  });
});

it("reads a first spend as launched in the range, running since a day in the lookback, or older than it", () => {
  const from = "2026-09-01";
  expect(lookbackStart(from)).toBe("2025-09-01");
  expect(firstSpend(null, from)).toBeNull();
  expect(firstSpend(from, from)).toEqual({ when: "launched", date: from });
  expect(firstSpend("2026-08-31", from)).toEqual({ when: "running", date: "2026-08-31" });
  expect(firstSpend("2025-09-02", from)).toEqual({ when: "running", date: "2025-09-02" });
  expect(firstSpend("2025-09-01", from)).toEqual({ when: "older" });
});

it("judges a selection's coverage against every creative in scope, as the list does", async () => {
  const filters = { ...FILTERS, sort: "spend" as const };
  const baselines: BaselineRanges = [{ from: "2026-08-04", to: "2026-08-31" }, null];
  const list = await sample(filters, baselines);
  // The earliest-started flight still running ends before the range does, so its own days stop early.
  const [ending] = list.creatives
    .flatMap((creative) =>
      creative.firstSpend?.when === "running" ? [{ creative, date: creative.firstSpend.date }] : [],
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  if (!ending) throw new Error("The sample needs a flight that ends inside the range");
  const picked: [string, string][] = [[ending.creative.channel, ending.creative.creativeId]];
  const selected = await sample({ ...filters, selection: picked }, baselines);
  expect(selected.creatives.map((creative) => creative.creativeId)).toEqual([ending.creative.creativeId]);
  expect(list.coverage?.latest_date).toBe(FILTERS.range.to);
  expect(selected.coverage).toEqual(list.coverage);
});
