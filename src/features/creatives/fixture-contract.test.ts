import { describe, expect, it } from "vitest";
import { CreativeRow, toCreative, safeAdUrl } from "./rows";
import { sampleCreatives } from "./sample";
import { sumDecimals } from "@/lib/data/decimal";

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
    const base = {
      creative_id: "c1",
      spend: "1.5",
      title: "t",
      body: "b",
      thumbnail_url: null,
      call_to_action: null,
      channel: "meta_ads",
      impressions: "1",
      clicks: "0",
      conversions: "0",
      ctr: "0",
      revenue: "0",
      roas: "0",
      cpo: null,
      ad_url: null,
    };
    const urlFor = (image: string | null) => toCreative(CreativeRow.parse({ ...base, image_url: image })).imageUrl;
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
