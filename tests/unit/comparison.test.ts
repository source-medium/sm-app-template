import { describe, expect, it } from "vitest";
import { compareValues, comparisonRange, coverageIssue, parseComparison } from "@/lib/comparison";
import { rangeLength } from "@/lib/filters";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { formatCount, formatMoney } from "@/lib/format";

describe("comparison dates", () => {
  it("uses the immediately preceding equal-length inclusive period across year and DST boundaries", () => {
    expect(comparisonRange({ from: "2026-01-01", to: "2026-01-07" }, "previous")).toEqual({
      from: "2025-12-25",
      to: "2025-12-31",
    });
    const current = { from: "2026-03-01", to: "2026-03-28" };
    const baseline = comparisonRange(current, "previous");
    expect(baseline).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    if (!baseline) throw new Error("Expected a comparison range");
    expect(rangeLength(baseline)).toBe(rangeLength(current));
  });

  it("uses calendar dates last year, clamping leap day without rolling into March", () => {
    expect(comparisonRange({ from: "2024-02-29", to: "2024-02-29" }, "year")).toEqual({
      from: "2023-02-28",
      to: "2023-02-28",
    });
    expect(comparisonRange({ from: "2025-02-28", to: "2025-03-01" }, "year")).toEqual({
      from: "2024-02-28",
      to: "2024-03-01",
    });
    expect(comparisonRange({ from: "2024-02-28", to: "2024-03-01" }, "year")).toEqual({
      from: "2023-02-28",
      to: "2023-03-01",
    });
  });

  it("defaults invalid modes, supports Off, and never creates unsupported earlier dates", () => {
    const range = { from: "2026-09-01", to: "2026-09-07" };
    expect(parseComparison({ compare: "injected" }, range).mode).toBe("previous");
    expect(parseComparison({ compare: ["year", "off"] }, range).mode).toBe("year");
    expect(parseComparison({ compare: "off" }, range)).toEqual({ mode: "off", range: null });
    for (const mode of ["previous", "year"] as const) {
      expect(comparisonRange({ from: "0001-01-01", to: "0001-01-01" }, mode)).toBeNull();
    }
  });
});

describe("metric changes", () => {
  it("subtracts large money and INT64 values exactly before calculating percentages", () => {
    expect(compareValues("9007199254740993.01", "9007199254740993")).toMatchObject({
      difference: "0.01",
      direction: "up",
      percent: "0.00",
    });
    expect(compareValues(9007199254740993n, 9007199254740992n)).toMatchObject({ difference: 1n, direction: "up" });
    expect(compareValues("3.01", "2")).toMatchObject({ difference: "1.01", percent: "50.50" });
    expect(compareValues("0.1", "0.3")).toMatchObject({ difference: "-0.2", percent: "-66.67" });
    expect(compareValues(1n, 32n).percent).toBe("-96.88");
  });

  it("supports fractional measures and leaves undefined percentage changes undefined", () => {
    expect(compareValues(10.5, 7)).toMatchObject({ difference: 3.5, percent: 50 });
    expect(compareValues("10", "0")).toMatchObject({ difference: "10", percent: null, reason: "zero" });
    expect(compareValues("-5", "-10")).toMatchObject({ difference: "5", percent: null, reason: "negative" });
    expect(compareValues(0n, 0n)).toMatchObject({ direction: "flat", percent: null });
    expect(compareValues(0, 10)).toMatchObject({ difference: -10, percent: -100 });
    expect(compareValues(null, "20")).toMatchObject({ difference: null, reason: "missing" });
    expect(compareValues(20n, null)).toMatchObject({ difference: null, reason: "missing" });
    expect(compareValues(Infinity, 1)).toMatchObject({ difference: null, reason: "missing" });
    expect(compareValues(Number.MAX_VALUE, -Number.MAX_VALUE)).toMatchObject({ difference: null });
    expect(() => compareValues<string | number>("10", 5)).toThrow("same type");
  });

  it("uses metric-specific sentiment, including unchanged and neutral changes", () => {
    expect(kpiDelta("150", "100", formatMoney, "higher")).toEqual({
      display: "+50.00 (+50%)",
      comparedTo: "100.00",
      direction: "up",
      good: true,
    });
    expect(kpiDelta("150", "100", formatMoney)).toMatchObject({ good: null });
    expect(kpiDelta(5n, 10n, formatCount, "lower")).toMatchObject({ good: true });
    expect(kpiDelta(0n, 0n, formatCount, "higher")).toMatchObject({
      display: "No change",
      good: null,
      direction: "flat",
    });
    expect(kpiDelta("10", "0", formatMoney).display).toBe("+10.00 (zero baseline)");
    expect(kpiDelta("-5", "-10", formatMoney).display).toBe("+5.00 (negative baseline)");
    expect(kpiDelta(10n, null, formatCount)).toMatchObject({ display: "No comparison value", good: null });
  });
});

describe("comparison coverage", () => {
  const range = { from: "2026-09-12", to: "2026-10-09" };
  const baseline = { from: "2026-08-15", to: "2026-09-11" };

  it("hides period changes when the latest days have not loaded yet", () => {
    // The live case: a missing 9 October read as a 4% decline instead of under 1%.
    expect(coverageIssue(range, baseline, "2026-10-08", "2026-09-11")).toBe(
      "Changes are hidden because the selected period has no rows for its last 1 day, while the comparison has rows through its end. Days missing at the end are often ones that have not loaded yet, not zeros.",
    );
    expect(coverageIssue(range, baseline, "2026-10-06", "2026-09-10")).toContain(
      "no rows for its last 3 days, and the comparison for only its last 1 day",
    );
    expect(coverageIssue(range, baseline, null, "2026-09-11")).toContain("its last 28 days");
  });

  it("shows changes when gaps are not at the selected period's end, as in sparse data", () => {
    // Gaps before the end are not days that have yet to load, so sparse data keeps its changes.
    expect(coverageIssue(range, baseline, "2026-10-09", "2026-09-11")).toBeNull();
    expect(coverageIssue(range, baseline, "2026-10-09", "2026-09-01")).toBeNull();
    expect(coverageIssue(range, baseline, "2026-10-08", "2026-09-10")).toBeNull();
    expect(coverageIssue(range, baseline, "2026-10-09", null)).toBeNull();
  });

  it("hides changes across a leap day, where the periods differ in length", () => {
    expect(
      coverageIssue(
        { from: "2028-02-01", to: "2028-02-29" },
        { from: "2027-02-01", to: "2027-02-28" },
        "2028-02-29",
        "2027-02-28",
      ),
    ).toBe("Changes are hidden because the periods differ in length: 29 days selected, 28 days compared.");
  });
});
