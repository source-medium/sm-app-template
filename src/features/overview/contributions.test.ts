import { expect, it } from "vitest";
import { revenueContributions } from "./contributions";
import { sampleOverview } from "./sample";
import { sumDecimals } from "@/lib/data/decimal";
import { parseComparison } from "@/lib/comparison";
const filters = { storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-28" } };
it("reconciles same-source groups and preserves the existing comparison coverage gate", async () => {
  const comparison = parseComparison({ compare: "previous" }, filters.range);
  if (!comparison.range) throw new Error("Expected comparison");
  const current = await sampleOverview(filters, "2026-10-05");
  const previous = await sampleOverview({ ...filters, range: comparison.range }, "2026-10-05");
  expect(sumDecimals(current.contributions?.map((row) => row.revenue) ?? [])).toBe(current.totals?.netRevenue);
  const report = {
    current,
    comparison: { data: previous, error: null },
    coverage: { latest_date: filters.range.to, previous_latest_date: comparison.range.to },
  };
  expect(revenueContributions(report, filters, comparison)?.rows.length).toBeGreaterThan(0);
  expect(
    revenueContributions(
      { ...report, coverage: { ...report.coverage, latest_date: "2026-09-02" } },
      filters,
      comparison,
    ),
  ).toBeNull();
  const unknown = {
    ...current,
    contributions: [
      { channel: null, sub_channel: null, revenue: current.totals?.netRevenue ?? null, remainder: false },
    ],
  };
  expect(
    revenueContributions({ ...report, current: unknown }, filters, comparison)?.rows.some((row) =>
      row.label.includes("Unclassified"),
    ),
  ).toBe(true);
  const limited = revenueContributions(
    {
      ...report,
      current: { ...unknown, contributions: [{ channel: null, sub_channel: null, revenue: "1", remainder: true }] },
    },
    filters,
    comparison,
  );
  expect(limited?.limited).toBe(true);
  expect(limited?.rows).toEqual([]);
  expect(limited?.periods?.[0]?.groups[0]).toMatchObject({ remainder: true, revenue: "1" });
});
