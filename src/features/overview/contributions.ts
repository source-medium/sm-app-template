import { compareValues, periodChanges, type Comparison } from "@/lib/comparison";
import { fromUnits, sumDecimals, toUnits } from "@/lib/data/decimal";
import type { OverviewFilters, OverviewSlice, RevenueContribution } from "./queries";

/** Same summary population as the independent totals. A missing group has no recorded rows. */
export function revenueContributions(report: OverviewSlice, filters: OverviewFilters, comparison?: Comparison) {
  const current = report.current.contributions;
  const previous = report.comparison?.data?.contributions;
  if (
    !comparison ||
    !periodChanges(filters.range, comparison.range, report.coverage, comparison.alignment).show ||
    !current ||
    !previous
  )
    return null;
  // A ranked remainder may contain different entities in each period; do not assign its movement to named groups.
  if ([...current, ...previous].some((row) => row.remainder))
    return {
      rows: [],
      limited: true,
      periods: [
        { label: "Selected period", groups: current },
        { label: "Comparison period", groups: previous },
      ],
    };
  const key = (row: RevenueContribution) => JSON.stringify([row.channel, row.sub_channel]);
  const before = new Map(previous.map((row) => [key(row), row]));
  const now = new Map(current.map((row) => [key(row), row]));
  const rows = [...new Set([...now.keys(), ...before.keys()])].map((id) => {
    const a = now.get(id),
      b = before.get(id),
      row = a ?? b;
    const value = a ? a.revenue : "0",
      prior = b ? b.revenue : "0";
    return {
      id,
      label: `${row?.channel ?? "Unclassified sales channel"} / ${row?.sub_channel ?? "Unclassified sub-channel"}`,
      current: value,
      previous: prior,
      difference: compareValues(value, prior).difference,
    };
  });
  const total = compareValues(
    report.current.totals?.netRevenue ?? null,
    report.comparison?.data?.totals?.netRevenue ?? null,
  ).difference;
  const sum = sumDecimals(rows.map((row) => row.difference));
  if (total !== null && sum !== null && toUnits(total) !== toUnits(sum)) {
    rows.push({
      id: "residual",
      label: "Unreconciled difference",
      current: null,
      previous: null,
      difference: fromUnits(toUnits(total) - toUnits(sum)),
    });
  }
  return {
    rows: rows.sort((a, b) => {
      if (a.difference === null || b.difference === null)
        return a.difference === b.difference ? 0 : a.difference === null ? 1 : -1;
      const abs = (s: string) => {
        const n = toUnits(s);
        return n < 0n ? -n : n;
      };
      return abs(a.difference) > abs(b.difference)
        ? -1
        : abs(a.difference) < abs(b.difference)
          ? 1
          : a.id.localeCompare(b.id);
    }),
    limited: false,
  };
}
