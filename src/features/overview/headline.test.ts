import { describe, expect, it } from "vitest";
import { baselineFor } from "@/lib/comparison";
import { overviewHeadline } from "./headline";
import type { OverviewData, OverviewSlice } from "./queries";

const period = (netRevenue: string, adSpend: string, latestDate: string): OverviewData => ({
  revenue: null,
  days: [],
  totals: { netRevenue, orders: 100, sessions: 1n, adClicks: 1n, adSpend },
  summaries: [],
  purchases: null,
  latestDate,
});
const filters = { storeId: "s", range: { from: "2026-09-01", to: "2026-09-28" } };
const previous = baselineFor(filters.range, "custom", "previous");
const report = (current: OverviewData, compared: OverviewData | null): OverviewSlice => ({
  current,
  comparison: compared ? { data: compared, error: null } : null,
  coverage: compared ? { latest_date: current.latestDate, previous_latest_date: compared.latestDate } : null,
});

describe("overview headline", () => {
  it("reads revenue and marketing efficiency against the comparison period", () => {
    const text = overviewHeadline(
      report(period("272097.19", "19107.61", "2026-09-28"), period("256597.19", "17905.72", "2026-08-31")),
      filters,
      previous,
      "USD",
    );
    expect(text).toBe(
      "Net revenue rose 6.04% to $272,097.19 against the previous 28 days. Ad spend rose 6.71%, and marketing efficiency slipped to 14.24x.",
    );
  });

  it("names declines, flat periods, and last-year comparisons", () => {
    expect(
      overviewHeadline(
        report(period("90", "10", "2026-09-28"), period("100", "20", "2025-09-28")),
        filters,
        baselineFor(filters.range, "custom", "year"),
        null,
      ),
    ).toBe(
      "Net revenue fell 10% to 90.00 against the same period last year. Ad spend fell 50%, and marketing efficiency improved to 9x.",
    );
    expect(
      overviewHeadline(
        report(period("100", "10", "2026-09-28"), period("100", "10", "2026-08-31")),
        filters,
        previous,
        "USD",
      ),
    ).toBe(
      "Net revenue held at $100.00 against the previous 28 days. Ad spend held, and marketing efficiency held at 10x.",
    );
  });

  it("drops the marketing sentence without ad spend on both sides and reads tiny moves as flat", () => {
    const only = "Net revenue rose 11.11% to $100.00 against the previous 28 days.";
    expect(
      overviewHeadline(
        report(period("100", "0", "2026-09-28"), period("90", "10", "2026-08-31")),
        filters,
        previous,
        "USD",
      ),
    ).toBe(only);
    const current = period("100", "10", "2026-09-28");
    const noSpend = { ...current, totals: current.totals && { ...current.totals, adSpend: null } };
    expect(overviewHeadline(report(noSpend, period("90", "10", "2026-08-31")), filters, previous, "USD")).toBe(only);
    expect(
      overviewHeadline(
        report(period("100000.01", "10", "2026-09-28"), period("100000", "10", "2026-08-31")),
        filters,
        previous,
        "USD",
      ),
    ).toBe(
      "Net revenue held at $100,000.01 against the previous 28 days. Ad spend held, and marketing efficiency held at 10,000x.",
    );
  });

  it("names each baseline by what it compares: a weekday, a calendar month, 52 weeks earlier", () => {
    const day = { storeId: "s", range: { from: "2026-09-28", to: "2026-09-28" } };
    expect(
      overviewHeadline(
        report(period("100", "10", "2026-09-28"), period("90", "10", "2026-09-21")),
        day,
        baselineFor(day.range, "single_day", "previous"),
        "USD",
      ),
    ).toBe(
      "Net revenue rose 11.11% to $100.00 against the same weekday last week. Ad spend held, and marketing efficiency improved to 10x.",
    );
    const month = { storeId: "s", range: { from: "2026-09-01", to: "2026-09-30" } };
    expect(
      overviewHeadline(
        report(period("100", "10", "2026-09-30"), period("90", "10", "2026-08-31")),
        month,
        baselineFor(month.range, "full_month", "previous"),
        "USD",
      ),
    ).toMatch(/^Net revenue rose 11\.11% to \$100\.00 against the previous month\./);
    expect(
      overviewHeadline(
        report(period("100", "10", "2026-09-28"), period("90", "10", "2025-09-29")),
        day,
        baselineFor(day.range, "single_day", "weekday"),
        "USD",
      ),
    ).toMatch(/against the same weekday 52 weeks earlier\./);
  });

  it("says nothing without a trustworthy comparison", () => {
    const current = period("100", "10", "2026-09-28");
    expect(overviewHeadline(report(current, null), filters, undefined, "USD")).toBeNull();
    expect(
      overviewHeadline(report(current, null), filters, baselineFor(filters.range, "custom", "off"), "USD"),
    ).toBeNull();
    // The selected period is missing its last days while the comparison is complete: deltas are hidden, so is the sentence.
    expect(
      overviewHeadline(
        report(period("100", "10", "2026-09-20"), period("100", "10", "2026-08-31")),
        filters,
        previous,
        "USD",
      ),
    ).toBeNull();
    // A zero baseline has no percentage, so the sentence would have nothing honest to say.
    expect(overviewHeadline(report(current, period("0", "10", "2026-08-31")), filters, previous, "USD")).toBeNull();
  });
});
