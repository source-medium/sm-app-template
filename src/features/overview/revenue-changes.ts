import { compareValues, comparisonDates, periodChanges, type Comparison } from "@/lib/comparison";
import { toUnits } from "@/lib/data/decimal";
import { datesInRange } from "@/lib/filters";
import type { OverviewFilters, OverviewSlice } from "./queries";

/** Descriptive day-by-day contributions, not claims about why the business changed. */
export function largestRevenueChanges(report: OverviewSlice, filters: OverviewFilters, comparison?: Comparison) {
  if (!comparison || !periodChanges(filters.range, comparison.range, report.coverage, comparison.alignment).show)
    return [];
  const aligned = comparisonDates(filters.range, comparison);
  const dates = datesInRange(filters.range);
  const current = new Map(report.current.days.map((day) => [day.date, day.netRevenue]));
  const previous = new Map(report.comparison?.data?.days.map((day) => [day.date, day.netRevenue]));
  // Align by all calendar days, including dates missing from the query result.
  return dates
    .flatMap((date, index) => {
      const baselineDate = aligned[index];
      const now = current.get(date) ?? null;
      const prior = baselineDate ? (previous.get(baselineDate) ?? null) : null;
      const difference = compareValues(now, prior).difference;
      if (!baselineDate || difference === null || toUnits(difference) === 0n) return [];
      return [{ date, baselineDate, current: now, previous: prior, difference }];
    })
    .sort((a, b) => {
      const absolute = (value: string) => {
        const units = toUnits(value);
        return units < 0n ? -units : units;
      };
      const left = absolute(a.difference),
        right = absolute(b.difference);
      return left === right ? a.date.localeCompare(b.date) : left > right ? -1 : 1;
    })
    .slice(0, 3);
}
