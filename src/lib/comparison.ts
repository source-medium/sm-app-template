/** Calendar comparisons and exact changes, independent of any report or UI. */
import { fromUnits, toUnits } from "@/lib/data/decimal";
import { addDays, datesInRange, parseChoice, rangeLength, type DateRange, type SearchParams } from "@/lib/filters";

export const COMPARISON_OPTIONS = [
  { value: "previous", label: "Previous period" },
  { value: "year", label: "Same dates last year" },
  { value: "off", label: "Off" },
] as const;
export type ComparisonMode = (typeof COMPARISON_OPTIONS)[number]["value"];
export type Comparison = { mode: ComparisonMode; range: DateRange | null };

/** Calendar year shift, clamping Feb 29 to Feb 28; never silently rolls into March. */
function lastYear(date: string): string {
  const year = Number(date.slice(0, 4)) - 1;
  const shifted = `${String(year).padStart(4, "0")}${date.slice(4)}`;
  return new Date(`${shifted}T00:00:00Z`).toISOString().slice(0, 10) === shifted
    ? shifted
    : `${String(year).padStart(4, "0")}-02-28`;
}

export function comparisonRange(range: DateRange, mode: ComparisonMode): DateRange | null {
  if (mode === "off") return null;
  if (mode === "year") return range.from < "0002-01-01" ? null : { from: lastYear(range.from), to: lastYear(range.to) };
  const length = rangeLength(range);
  const from = addDays(range.from, -length);
  return from < "0001-01-01" ? null : { from, to: addDays(range.from, -1) };
}

export function parseComparison(params: SearchParams, range: DateRange): Comparison {
  const mode = parseChoice(
    params,
    "compare",
    COMPARISON_OPTIONS.map((option) => option.value),
    "previous",
  );
  return { mode, range: comparisonRange(range, mode) };
}

/** Align prior-period days by position, or last-year days by calendar date. An unmatched leap day stays a gap. */
export function comparisonDates(range: DateRange, comparison: Comparison): (string | null)[] {
  return datesInRange(range).map((date, index) => {
    if (!comparison.range) return null;
    if (comparison.mode === "previous") return addDays(comparison.range.from, index);
    if (comparison.mode === "year") {
      const shifted = `${Number(date.slice(0, 4)) - 1}`.padStart(4, "0") + date.slice(4);
      return new Date(`${shifted}T00:00:00Z`).toISOString().slice(0, 10) === shifted ? shifted : null;
    }
    return null;
  });
}

export type MetricValue = string | bigint | number;
export type MetricChange<T extends MetricValue> = {
  difference: T | null;
  direction: "up" | "down" | "flat" | null;
  /** Percentage change, already multiplied by 100. Exact inputs round to two decimal places. */
  percent: string | number | null;
  reason: "missing" | "zero" | "negative" | null;
};

/** Same-type values only. Money/count subtraction happens before any rounding. */
export function compareValues<T extends MetricValue>(current: T | null, baseline: T | null): MetricChange<T> {
  const missing: MetricChange<T> = { difference: null, direction: null, percent: null, reason: "missing" };
  if (current === null || baseline === null) return missing;
  let difference: MetricValue;
  let percent: string | number | null = null;
  if (typeof current === "number" && typeof baseline === "number") {
    difference = current - baseline;
    if (![current, baseline, difference].every(Number.isFinite)) return missing;
    const relative = (difference / baseline) * 100;
    if (baseline > 0 && Number.isFinite(relative)) percent = relative;
  } else if (
    (typeof current === "string" && typeof baseline === "string") ||
    (typeof current === "bigint" && typeof baseline === "bigint")
  ) {
    const a = typeof current === "string" ? toUnits(current) : current;
    const b = typeof baseline === "string" ? toUnits(baseline) : baseline;
    const change = a - b;
    difference = typeof current === "string" ? fromUnits(change) : change;
    if (b > 0n) {
      // Round the rational percent directly, without losing a small change in a huge value.
      const absolute = change < 0n ? -change : change;
      const hundredths = (absolute * 10_000n + b / 2n) / b;
      percent = `${change < 0n && hundredths !== 0n ? "-" : ""}${hundredths / 100n}.${String(hundredths % 100n).padStart(2, "0")}`;
    }
  } else {
    throw new Error("Comparison values must have the same type.");
  }
  const zero = typeof difference === "string" ? toUnits(difference) : difference;
  const base = typeof baseline === "string" ? toUnits(baseline) : (baseline as number | bigint);
  return {
    difference: difference as T,
    direction: zero > 0 ? "up" : zero < 0 ? "down" : "flat",
    percent,
    reason: base === 0 || base === 0n ? "zero" : base < 0 ? "negative" : null,
  };
}
