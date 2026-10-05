import { describe, expect, it } from "vitest";
import { compactNumber } from "@/components/charts/compact-number";
import { formatCount, formatDay, formatMeasure, formatPercent, formatWallTime } from "@/lib/format";

describe("server formatting", () => {
  it("formats exact counts with every digit", () => {
    expect(formatCount(9_007_199_254_740_993n)).toBe("9,007,199,254,740,993");
    expect(formatCount(null)).toBe("—");
  });

  it("shows fractional measures to two places and whole ones without decimals", () => {
    expect(formatMeasure(1234)).toBe("1,234");
    expect(formatMeasure(12.345)).toBe("12.35");
  });

  it("formats warehouse dates and wall times without shifting them into a time zone", () => {
    expect(formatDay("2026-10-04")).toBe("Oct 4");
    expect(formatWallTime("2026-10-04T23:30:00")).toBe("Oct 4, 2026, 11:30 PM");
  });

  it("formats ratios as percents", () => {
    expect(formatPercent(0.0126)).toBe("1.26%");
    expect(formatPercent(null)).toBe("—");
  });

  it("compacts axis ticks without locale APIs", () => {
    expect([950, 1200, 45_000, 3_400_000, -2500].map(compactNumber)).toEqual(["950", "1.2K", "45K", "3.4M", "-2.5K"]);
  });
});
