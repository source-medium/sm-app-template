import { describe, expect, it } from "vitest";
import { samplePaidMarketing, samplePaidSource } from "./sample";

const FILTERS = { storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-14" }, channel: null };

describe("paid marketing fixture contract", () => {
  it("decodes through the live row schemas and covers every channel and date", async () => {
    const data = await samplePaidMarketing(FILTERS);
    const channels = new Set(data.channelDays.map((day) => day.channel));
    expect(channels).toEqual(new Set(["Meta", "Google", "TikTok", "Pinterest"]));
    expect(data.channelDays).toHaveLength(channels.size * 14);
  });

  it("series and campaign totals agree with an independent sum of the source rows", async () => {
    const data = await samplePaidMarketing(FILTERS);
    const expected = samplePaidSource(FILTERS.storeId, FILTERS.range).reduce((sum, row) => sum + row.impressions, 0n);
    const fromSeries = data.channelDays.reduce((sum, day) => sum + (day.impressions ?? 0n), 0n);
    const fromCampaigns = data.campaigns.reduce((sum, campaign) => sum + (campaign.impressions ?? 0n), 0n);
    expect(fromSeries).toBe(expected);
    expect(fromCampaigns).toBe(expected);
  });

  it("filters campaigns by channel but keeps every channel's series", async () => {
    const data = await samplePaidMarketing({ ...FILTERS, channel: "Google" });
    expect(data.campaigns.every((campaign) => campaign.channel === "Google")).toBe(true);
    expect(new Set(data.channelDays.map((day) => day.channel)).size).toBe(4);
  });

  it("sorts campaigns by impressions, largest first", async () => {
    const { campaigns } = await samplePaidMarketing(FILTERS);
    for (let index = 1; index < campaigns.length; index += 1) {
      expect((campaigns[index - 1]?.impressions ?? 0n) >= (campaigns[index]?.impressions ?? 0n)).toBe(true);
    }
  });
});
