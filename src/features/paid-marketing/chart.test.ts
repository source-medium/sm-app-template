/**
 * The channel chart names the seven largest channels, folds the rest into
 * Other, and always shows a selected channel, however small.
 */
import { describe, expect, it } from "vitest";
import { channelChart } from "./chart";
import type { ChannelDay } from "./queries";

/** Nine channels, ch1 largest by impressions through ch9 smallest. */
const DAYS: ChannelDay[] = Array.from({ length: 9 }, (_, index) => ({
  channel: `ch${index + 1}`,
  date: "2026-09-01",
  spend: `${index + 1}.10`,
  impressions: BigInt(1000 - index * 100),
  clicks: BigInt(index + 1),
  conversions: index + 0.5,
  platformRevenue: 10 * (index + 1),
}));

describe("paid marketing channel chart", () => {
  it("divides summed inputs across calendar intervals and folded channels, never averaging ratios", () => {
    const first = DAYS[0];
    if (!first) throw new Error("Missing channel day");
    const days = [
      { ...first, date: "2026-09-01", spend: "10", platformRevenue: 100, conversions: 1 },
      { ...first, date: "2026-09-02", spend: "90", platformRevenue: 90, conversions: 9 },
    ];
    expect(channelChart(days, "roas", null, "week").byDate.get("2026-08-31")?.channel0).toBe(1.9);
    expect(channelChart(days, "cpo", null, "month").byDate.get("2026-09-01")?.channel0).toBe(10);
    const folded = channelChart(DAYS, "roas", null).byDate.get("2026-09-01")?.other;
    expect(folded).toBeCloseTo(170 / 17.2);
    expect(channelChart([{ ...first, spend: "0" }], "roas", null).byDate.get("2026-09-01")?.channel0).toBeNull();
    expect(channelChart([{ ...first, conversions: null }], "cpo", null).byDate.get("2026-09-01")?.channel0).toBeNull();
  });
  it("names the seven largest channels in name order and folds the rest into Other", () => {
    const chart = channelChart(DAYS, "spend", null);
    expect(chart.folded).toBe(true);
    expect(chart.series.map((item) => item.label)).toEqual(["ch1", "ch2", "ch3", "ch4", "ch5", "ch6", "ch7", "Other"]);
    expect(chart.byDate.get("2026-09-01")?.other).toBe("17.2");
    expect(chart.channels).toHaveLength(9);
  });

  it("shows a selected channel that is too small to be named, and only that channel", () => {
    const chart = channelChart(DAYS, "clicks", "ch9");
    expect(chart.series).toEqual([{ key: "selected", label: "ch9", color: "var(--chart-8)" }]);
    expect(chart.byDate.get("2026-09-01")?.selected).toBe(9n);
  });

  it("keeps a named channel's key and color when it is selected", () => {
    const all = channelChart(DAYS, "spend", null);
    const one = channelChart(DAYS, "spend", "ch3");
    expect(one.series).toEqual([all.series.find((item) => item.label === "ch3")]);
  });
});
