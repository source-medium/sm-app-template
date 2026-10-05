import { describe, expect, it } from "vitest";
import { sumDecimals, toUnits } from "@/lib/data/decimal";
import { samplePaidMarketing, samplePaidSource } from "./sample";

const FILTERS = { storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-14" }, channel: null };

describe("paid marketing fixture contract", () => {
  it("decodes through the live row schemas and covers every channel and date", async () => {
    const data = await samplePaidMarketing(FILTERS);
    const channels = new Set(data.channelDays.map((day) => day.channel));
    expect(channels).toEqual(new Set(["Meta", "Google", "TikTok", "Pinterest"]));
    expect(data.channelDays).toHaveLength(channels.size * 14);
  });

  it("series and campaign totals agree with an independent sum of the source rows, money exactly", async () => {
    const data = await samplePaidMarketing(FILTERS);
    const source = samplePaidSource(FILTERS.storeId, FILTERS.range);
    const impressions = source.reduce((sum, row) => sum + row.impressions, 0n);
    expect(data.channelDays.reduce((sum, day) => sum + (day.impressions ?? 0n), 0n)).toBe(impressions);
    expect(data.campaigns.reduce((sum, campaign) => sum + (campaign.impressions ?? 0n), 0n)).toBe(impressions);

    const spendCents = source.reduce((sum, row) => sum + row.spendCents, 0n);
    const expectedSpend = `${spendCents / 100n}.${String(spendCents % 100n).padStart(2, "0")}`.replace(/\.?0+$/, "");
    expect(sumDecimals(data.channelDays.map((day) => day.spend))).toBe(expectedSpend);
    expect(sumDecimals(data.campaigns.map((campaign) => campaign.spend))).toBe(expectedSpend);
  });

  it("filters campaigns by channel but keeps every channel's series", async () => {
    const data = await samplePaidMarketing({ ...FILTERS, channel: "Google" });
    expect(data.campaigns.every((campaign) => campaign.channel === "Google")).toBe(true);
    expect(new Set(data.channelDays.map((day) => day.channel)).size).toBe(4);
  });

  it("sorts campaigns by spend, largest first", async () => {
    const { campaigns } = await samplePaidMarketing(FILTERS);
    for (let index = 1; index < campaigns.length; index += 1) {
      expect(toUnits(campaigns[index - 1]?.spend ?? "0") >= toUnits(campaigns[index]?.spend ?? "0")).toBe(true);
    }
  });
});
