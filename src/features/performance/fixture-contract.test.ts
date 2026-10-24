import { describe, expect, it } from "vitest";
import { sumDecimals, fromUnits, toUnits } from "@/lib/data/decimal";
import { countedSales, sampleSummarySource } from "@/lib/sample/executive-summary";
import { performanceRowLimit } from "./rows";
import { periodRange } from "@/lib/time-grain";
import { sampleBusiness, samplePlatforms } from "./sample";
import { businessRatios, platformRatios } from "./measures";
import type { PerformanceFilters } from "./queries";

function present<T>(value: T | null | undefined): T {
  if (value == null) throw new Error("Expected fixture value");
  return value;
}

const filters: PerformanceFilters = {
  storeId: "sample-store-a",
  range: { from: "2026-09-02", to: "2026-10-04" },
  channel: null,
  grain: "day",
};
describe("performance fixtures", () => {
  it.each(["day", "week", "month"] as const)("keeps complete totals and selected edges at %s grain", (grain) => {
    const rows = sampleBusiness({ ...filters, grain });
    const periods = rows.filter((row) => !row.is_total);
    const total = present(rows.find((row) => row.is_total));
    // The published rows as summary reports count them: exchange orders are not sales.
    const source = sampleSummarySource(filters.storeId, filters.range).map(countedSales);
    const cents = source.reduce((sum, row) => sum + row.order_net_revenue_cents, 0n);
    expect(total.revenue).toBe(fromUnits(cents * 10_000_000n));
    expect(total.orders).toBe(source.reduce((sum, row) => sum + row.order_count, 0));
    expect(total.sessions).toBe(source.reduce((sum, row) => sum + row.website_sessions, 0n));
    expect(sumDecimals(periods.map((row) => row.revenue))).toBe(total.revenue);
    expect(periodRange(present(present(periods.at(-1)).period_date), grain, filters.range).from).toBe(
      filters.range.from,
    );
    expect(periodRange(present(present(periods[0]).period_date), grain, filters.range).to).toBe(filters.range.to);
    expect(sumDecimals([total.gross, total.discounts])).toBe(total.demand);
    expect(sumDecimals([total.demand, total.refunds])).toBe(total.revenue);
  });
  it("keeps sales channels separate and returns no rows for unknown stores or channels", () => {
    const all = present(sampleBusiness(filters).find((row) => row.is_total));
    const dtc = present(sampleBusiness({ ...filters, channel: "online_dtc" }).find((row) => row.is_total));
    const amazon = present(sampleBusiness({ ...filters, channel: "amazon" }).find((row) => row.is_total));
    const exchanged = present(sampleBusiness({ ...filters, channel: "exchanged" }).find((row) => row.is_total));
    // The sample publishes exchange orders, which are not sales: order measures count valid channels only.
    expect(toUnits(exchanged.revenue ?? "")).toBe(0n);
    expect(present(exchanged.orders)).toBe(0);
    expect(sumDecimals([dtc.revenue, amazon.revenue])).toBe(all.revenue);
    expect(present(dtc.orders) + present(amazon.orders)).toBe(all.orders);
    for (const sample of [sampleBusiness, samplePlatforms]) {
      expect(sample({ ...filters, storeId: "missing" })).toEqual([]);
      expect(sample({ ...filters, channel: "missing" })).toEqual([]);
    }
  });
  it("keeps platform and combined totals invariant across grains without double-counting totals", () => {
    const totals = ["day", "week", "month"].map((grain) => {
      const rows = samplePlatforms({ ...filters, grain: grain as PerformanceFilters["grain"] });
      const combined = present(rows.find((row) => row.combined && row.is_total));
      expect(sumDecimals(rows.filter((row) => !row.combined && row.is_total).map((row) => row.spend))).toBe(
        combined.spend,
      );
      expect(sumDecimals(rows.filter((row) => row.combined && !row.is_total).map((row) => row.spend))).toBe(
        combined.spend,
      );
      expect(
        rows.filter((row) => !row.combined && row.is_total).reduce((sum, row) => sum + present(row.clicks), 0n),
      ).toBe(combined.clicks);
      return combined;
    });
    expect(totals[1]).toEqual(totals[0]);
    expect(totals[2]).toEqual(totals[0]);
  });
  it("adds every platform measure across disjoint sales channels", () => {
    const all = samplePlatforms(filters);
    const dtc = samplePlatforms({ ...filters, channel: "online_dtc" });
    const amazon = samplePlatforms({ ...filters, channel: "amazon" });
    for (const [index, row] of all.entries()) {
      const a = present(dtc[index]);
      const b = present(amazon[index]);
      for (const field of ["spend", "impressions", "clicks", "conversions"] as const)
        expect(sumDecimals([String(a[field]), String(b[field])])).toBe(sumDecimals([String(row[field])]));
      expect(present(a.revenue) + present(b.revenue)).toBeCloseTo(present(row.revenue), 8);
    }
  });
  it("uses ratio-of-sums, preserves missing inputs and refuses unsafe count ratios", () => {
    const business = present(sampleBusiness(filters).find((row) => row.is_total));
    expect(businessRatios({ ...business, revenue: "100", spend: "40", orders: 5, sessions: 10n })).toMatchObject({
      mer: 2.5,
      cpo: 8,
      cps: 4,
      spend_share: 0.4,
    });
    const platform = present(samplePlatforms(filters).find((row) => row.is_total));
    expect(
      platformRatios({ ...platform, spend: "40", clicks: 10n, impressions: 1000n, revenue: 100, conversions: 2.5 }),
    ).toEqual({ ctr: 0.01, cpm: 40, cpc: 4, cvr: 0.25, roas: 2.5, average: 40, cpo: 16 });
    expect(platformRatios({ ...platform, spend: null, clicks: 0n, conversions: null })).toMatchObject({
      cpc: null,
      cpo: null,
      cvr: null,
      roas: null,
    });
    expect(platformRatios({ ...platform, impressions: 9007199254740993n }).ctr).toBeNull();
    expect(businessRatios({ ...business, sessions: 9007199254740993n }).cps).toBeNull();
  });
});

it("multi-selection adds the same reviewed channels without broadening unknown choices", () => {
  const selected = { ...filters, channel: '["amazon","online_dtc"]' };
  expect(sampleBusiness(selected)).toEqual(sampleBusiness(filters));
  expect(samplePlatforms(selected)).toEqual(samplePlatforms(filters));
  expect(sampleBusiness({ ...filters, channel: '["missing","amazon"]' })).toEqual(
    sampleBusiness({ ...filters, channel: "amazon" }),
  );
});
it("bounds each grain and includes its full total", () => {
  const range = { from: "2025-01-01", to: "2025-12-31" };
  expect(performanceRowLimit(range, "day")).toBe(366);
  expect(performanceRowLimit(range, "month")).toBe(13);
  expect(performanceRowLimit(range, "week")).toBe(54);
});
