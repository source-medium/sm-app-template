import { expect, it } from "vitest";
import { largestRevenueChanges } from "./revenue-changes";
import type { OverviewData, OverviewDay, OverviewReport } from "./queries";

const day = (date: string, netRevenue: string | null): OverviewDay => ({
  date,
  netRevenue,
  orders: 1,
  sessions: 1n,
  adClicks: 0n,
  adSpend: "0",
});
const data = (days: OverviewDay[]): OverviewData => ({
  days,
  totals: null,
  summaries: [],
  purchases: null,
  revenue: null,
  latestDate: days.at(-1)?.date ?? null,
});
const filters = { storeId: "sample-store-a", range: { from: "2026-09-01", to: "2026-09-04" } };
const period = { mode: "previous" as const, range: { from: "2026-08-28", to: "2026-08-31" } };
const report = (current: OverviewDay[], previous: OverviewDay[]): OverviewReport => ({
  current: data(current),
  comparison: { data: data(previous), error: null },
  coverage: { latest_date: "2026-09-04", previous_latest_date: "2026-08-31" },
});

it("ranks signed daily contributions by exact magnitude, including changes below float precision", () => {
  const result = largestRevenueChanges(
    report(
      [day("2026-09-01", "9007199254740993.1"), day("2026-09-02", "0"), day("2026-09-03", "8"), day("2026-09-04", "3")],
      [day("2026-08-28", "9007199254740993"), day("2026-08-29", "10"), day("2026-08-30", "0"), day("2026-08-31", "3")],
    ),
    filters,
    period,
  );
  expect(result.map((row) => [row.date, row.difference])).toEqual([
    ["2026-09-02", "-10"],
    ["2026-09-03", "8"],
    ["2026-09-01", "0.1"],
  ]);
});

it("keeps alignment across absent rows and excludes missing measures rather than treating them as zero", () => {
  const result = largestRevenueChanges(
    report(
      [day("2026-09-01", "1"), day("2026-09-03", "30"), day("2026-09-04", "4")],
      [day("2026-08-28", null), day("2026-08-29", "200"), day("2026-08-30", "3"), day("2026-08-31", "4")],
    ),
    filters,
    period,
  );
  expect(result.map((row) => [row.date, row.baselineDate, row.difference])).toEqual([
    ["2026-09-03", "2026-08-30", "27"],
  ]);
});

it("does not summarize disabled, failed or incomparable periods", () => {
  const value = report([day("2026-09-04", "4")], [day("2026-08-31", "3")]);
  expect(largestRevenueChanges(value, filters)).toEqual([]);
  expect(largestRevenueChanges({ ...value, coverage: null }, filters, period)).toEqual([]);
  expect(
    largestRevenueChanges(
      { ...value, coverage: { latest_date: "2026-09-03", previous_latest_date: "2026-08-31" } },
      filters,
      period,
    ),
  ).toEqual([]);
});
