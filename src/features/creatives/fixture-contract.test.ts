import { describe, expect, it } from "vitest";
import { CreativeRow, toCreative } from "./rows";
import { sampleCreatives } from "./sample";

const FILTERS = { storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-28" } };

describe("creatives fixture contract", () => {
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
      channel: "Meta",
      impressions: "1",
      clicks: "0",
      conversions: "0",
      ctr: "0",
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

it("filters channels before sorting and does not silently substitute unknown channels", async () => {
  const { sampleCreativeChannels } = await import("./sample");
  expect(sampleCreativeChannels(FILTERS)).toEqual(["Google", "Meta", "TikTok"]);
  const google = await sampleCreatives({ ...FILTERS, sort: "spend", channel: "Google" });
  expect(google.creatives.length).toBeGreaterThan(0);
  expect(google.creatives.every((row) => row.channel === "Google")).toBe(true);
  expect((await sampleCreatives({ ...FILTERS, sort: "ctr", channel: "unknown" })).creatives).toEqual([]);
});
