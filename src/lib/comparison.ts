/**
 * Calendar comparisons and exact changes, independent of any report or UI.
 *
 * A report compares its selected range with up to two baselines (a
 * ComparisonPlan). What "previous period" means depends on what the range is:
 * a full month compares with the previous full month even though the day
 * counts differ, a rolling 28 days with the 28 days before it, a single day
 * with the same weekday a week earlier. rangeIntent() takes that intent from the
 * date preset the range is (`range=quarter-to-date`), and otherwise reads it from
 * the applied dates, so the same dates picked as different presets keep each meaning.
 */
import { fromUnits, toUnits } from "@/lib/data/decimal";
import {
  addDays,
  datesInRange,
  monthStart,
  parseChoice,
  PERIOD_START,
  quarterStart,
  rangeLength,
  rangePreset,
  type DatePeriod,
  type DatePreset,
  type DateRange,
  type SearchParams,
} from "@/lib/filters";

export const COMPARISON_OPTIONS = [
  { value: "previous", label: "Previous period" },
  { value: "year", label: "Same period last year" },
  { value: "weekday", label: "52 weeks earlier" },
  { value: "off", label: "Off" },
] as const;
export type ComparisonMode = (typeof COMPARISON_OPTIONS)[number]["value"];
/**
 * `position` lines dates up by their place in the period and requires equal
 * lengths; `calendar` lines them up by calendar date (a month with last year's
 * month, March with February) and lets the lengths differ.
 */
export type Alignment = "position" | "calendar";
/** One baseline as a view uses it: its dates and how they line up with the selected ones. */
export type Comparison = { mode: ComparisonMode; range: DateRange | null; alignment?: Alignment };
export type Baseline = Comparison & {
  alignment: Alignment;
  /** How the caption and KPI rows name it: "previous 28 days", "same period last year". */
  label: string;
  /** Why there is no range, when there is none. */
  note: string | null;
};
export type RangeIntent =
  | "single_day"
  | "rolling"
  | "full_week"
  | "week_to_date"
  | "full_month"
  | "month_to_date"
  | "full_quarter"
  | "quarter_to_date"
  | "full_year"
  | "year_to_date"
  | "custom";
/** Each slot's dates for a query; null for a slot that is off or has no matching dates. */
export type BaselineRanges = [DateRange | null, DateRange | null];
export type ComparisonPlan = {
  range: DateRange;
  intent: RangeIntent;
  slots: [Baseline, Baseline];
  /** The slot whose overlay and change columns show; KPI cards always show both. */
  active: 0 | 1;
};

const MODES = COMPARISON_OPTIONS.map((option) => option.value);

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}
function daysInMonth(year: number, month: number): number {
  return [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1] ?? 31;
}
const year = (date: string) => Number(date.slice(0, 4));
const month = (date: string) => Number(date.slice(5, 7));
const day = (date: string) => Number(date.slice(8, 10));
const iso = (y: number, m: number, d: number) =>
  `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
const monthEnd = (date: string) => iso(year(date), month(date), daysInMonth(year(date), month(date)));
/** The first day of the month `offset` months before (or after) `date`'s month. */
function shiftMonth(date: string, offset: number): string {
  const index = year(date) * 12 + (month(date) - 1) + offset;
  return iso(Math.floor(index / 12), (index % 12) + 1, 1);
}
const quarterEnd = (date: string) => monthEnd(shiftMonth(quarterStart(date), 2));
const PERIOD_END: Record<DatePeriod, (date: string) => string> = {
  week: (date) => addDays(PERIOD_START.week(date), 6),
  month: monthEnd,
  quarter: quarterEnd,
  year: (date) => `${date.slice(0, 4)}-12-31`,
};
const FULL_PERIOD = {
  week: "full_week",
  month: "full_month",
  quarter: "full_quarter",
  year: "full_year",
} as const satisfies Record<DatePeriod, RangeIntent>;
const PERIOD_TO_DATE = {
  week: "week_to_date",
  month: "month_to_date",
  quarter: "quarter_to_date",
  year: "year_to_date",
} as const satisfies Record<DatePeriod, RangeIntent>;

/** The same calendar date a year earlier, or null for Feb 29, which has none. */
function sameDateLastYear(date: string): string | null {
  const shifted = `${String(year(date) - 1).padStart(4, "0")}${date.slice(4)}`;
  return new Date(`${shifted}T00:00:00Z`).toISOString().slice(0, 10) === shifted ? shifted : null;
}

/** Calendar year shift for a period boundary, clamping Feb 29 to Feb 28; never silently rolls into March. */
function lastYear(date: string): string {
  return sameDateLastYear(date) ?? `${String(year(date) - 1).padStart(4, "0")}-02-28`;
}

/**
 * What the applied range is: the period its date preset names (a to-date preset
 * that reached its period's end is the full period), or else judged from its
 * dates against the store's current date.
 */
export function rangeIntent(range: DateRange, today: string, preset?: DatePreset): RangeIntent {
  if (preset) {
    if ("days" in preset) return preset.days === 1 ? "single_day" : "rolling";
    return range.to === PERIOD_END[preset.period](range.from)
      ? FULL_PERIOD[preset.period]
      : PERIOD_TO_DATE[preset.period];
  }
  const yesterday = addDays(today, -1);
  if (range.from === range.to) return "single_day";
  if (range.from === monthStart(range.from)) {
    if (range.to === monthEnd(range.from)) return "full_month";
    if (range.to === yesterday && range.to.slice(0, 7) === range.from.slice(0, 7)) return "month_to_date";
  }
  if (range.from === quarterStart(range.from)) {
    if (range.to === quarterEnd(range.from)) return "full_quarter";
    if (range.to === yesterday && quarterStart(range.to) === range.from) return "quarter_to_date";
  }
  if (range.from === PERIOD_START.year(range.from)) {
    if (range.to === PERIOD_END.year(range.from)) return "full_year";
    if (range.to === yesterday && range.to.slice(0, 4) === range.from.slice(0, 4)) return "year_to_date";
  }
  return range.to === yesterday ? "rolling" : "custom";
}

/** "1 day" or "28 days", for comparison copy. */
export function dayCount(days: number): string {
  return days === 1 ? "1 day" : `${days} days`;
}

/** No range before year one, which the warehouse cannot hold either. */
const supported = (range: DateRange): DateRange | null => (range.from < "0001-01-01" ? null : range);

/** The baseline a mode names for this range, given what the range is. */
export function baselineFor(range: DateRange, intent: RangeIntent, mode: ComparisonMode): Baseline {
  const length = rangeLength(range);
  const make = (
    label: string,
    alignment: Alignment,
    candidate: DateRange | null,
    note: string | null = null,
  ): Baseline => ({
    mode,
    label,
    alignment,
    range: candidate ? supported(candidate) : null,
    note: candidate && supported(candidate) === null ? "The comparison period is before any supported date." : note,
  });
  if (mode === "off") return make("off", "position", null);
  if (mode === "weekday") {
    const label = intent === "single_day" ? "same weekday 52 weeks earlier" : "same weekdays 52 weeks earlier";
    return make(label, "position", { from: addDays(range.from, -364), to: addDays(range.to, -364) });
  }
  if (mode === "year") {
    const label = intent === "single_day" ? "same date last year" : "same period last year";
    if (intent === "single_day" && range.from.slice(5) === "02-29")
      return make(label, "calendar", null, "There is no February 29 in the previous year.");
    if (range.from < "0002-01-01") return make(label, "calendar", null, "There is no earlier year to compare with.");
    return make(label, "calendar", { from: lastYear(range.from), to: lastYear(range.to) });
  }
  // mode === "previous"
  switch (intent) {
    case "single_day":
      return make("same weekday last week", "position", { from: addDays(range.from, -7), to: addDays(range.to, -7) });
    case "full_week":
    case "week_to_date":
      return make(intent === "full_week" ? "previous week" : "previous week to date", "position", {
        from: addDays(range.from, -7),
        to: addDays(range.to, -7),
      });
    case "full_month": {
      const start = shiftMonth(range.from, -1);
      return make("previous month", "calendar", { from: start, to: monthEnd(start) });
    }
    case "month_to_date": {
      // A shorter previous month compares through its last day, as a full month does.
      const start = shiftMonth(range.from, -1);
      const to = iso(year(start), month(start), Math.min(day(range.to), daysInMonth(year(start), month(start))));
      return make("previous month to date", "calendar", { from: start, to });
    }
    case "full_quarter": {
      const start = shiftMonth(range.from, -3);
      return make("previous quarter", "calendar", { from: start, to: quarterEnd(start) });
    }
    case "quarter_to_date": {
      const start = shiftMonth(range.from, -3);
      const to = addDays(start, length - 1);
      if (to > quarterEnd(start))
        return make(
          "previous quarter to date",
          "position",
          null,
          `The previous quarter has fewer days than the ${dayCount(length)} selected, so there is no matching quarter-to-date period.`,
        );
      return make("previous quarter to date", "position", { from: start, to });
    }
    case "full_year":
    case "year_to_date":
      return make(intent === "full_year" ? "previous year" : "previous year to date", "calendar", {
        from: lastYear(range.from),
        to: lastYear(range.to),
      });
    default:
      return make(length === 1 ? "previous day" : `previous ${dayCount(length)}`, "position", {
        from: addDays(range.from, -length),
        to: addDays(range.from, -1),
      });
  }
}

const sameRange = (a: DateRange, b: DateRange) => a.from === b.from && a.to === b.to;

/**
 * Both baselines from the URL: `compare` (the first; it accepts the same
 * values as before, `previous` now follows what the range is, and `off` turns
 * both off), `compare2` (the second, defaulting to
 * last year unless the first already is) and `baseline=a|b` (which one the
 * charts and tables show). A second slot that resolves to the first's dates
 * is not queried; it says it matches instead.
 */
export function parseComparisonPlan(params: SearchParams, range: DateRange, today: string): ComparisonPlan {
  const intent = rangeIntent(range, today, rangePreset(params, range));
  const first = parseChoice(params, "compare", MODES, "previous");
  const second =
    first === "off" ? "off" : parseChoice(params, "compare2", MODES, first === "year" ? "previous" : "year");
  const a = baselineFor(range, intent, first);
  let b = baselineFor(range, intent, second);
  if (a.range && b.range && sameRange(a.range, b.range))
    b = { ...b, range: null, note: "This matches the first comparison, so it is shown once." };
  const active = activeBaseline(parseChoice(params, BASELINE_PARAM, BASELINE_VALUES, "a"), [!!a.range, !!b.range]);
  return { range, intent, slots: [a, b], active };
}

/** The URL parameter naming which slot charts and tables show, and its value for each slot. */
export const BASELINE_PARAM = "baseline";
export const BASELINE_VALUES = ["a", "b"] as const;

/** The URL's overlay choice, falling back to the first slot that has dates. */
export function activeBaseline(requested: string | null, available: readonly [boolean, boolean]): 0 | 1 {
  return requested === BASELINE_VALUES[1] && available[1] ? 1 : available[0] || !available[1] ? 0 : 1;
}

/** Each slot's dates for a query, or two nulls when the report has no plan. */
export function planRanges(plan: ComparisonPlan | undefined): BaselineRanges {
  return plan ? [plan.slots[0].range, plan.slots[1].range] : [null, null];
}

/** Both slots' modes as URL parameters, so links and exports keep the plan they were made from. */
export function planParams(plan: ComparisonPlan | undefined): { compare: ComparisonMode; compare2: ComparisonMode } {
  return { compare: plan?.slots[0].mode ?? "off", compare2: plan?.slots[1].mode ?? "off" };
}

/**
 * The baseline date each selected date lines up with, or null for a gap:
 * position-aligned periods by index, last year by calendar date, a previous
 * calendar month by day of month (so March 29 to 31 have no February match).
 */
export function comparisonDates(range: DateRange, comparison: Comparison): (string | null)[] {
  const baseline = comparison.range;
  // Last year, like a previous year or year to date, lines up by calendar date.
  const yearEarlier =
    comparison.mode === "year" || (baseline?.from === lastYear(range.from) && baseline.to === lastYear(range.to));
  return datesInRange(range).map((date, index) => {
    if (!baseline || comparison.mode === "off") return null;
    if (yearEarlier) return sameDateLastYear(date);
    const oneMonth =
      baseline.from.slice(0, 7) === baseline.to.slice(0, 7) && range.from.slice(0, 7) === range.to.slice(0, 7);
    if (comparison.alignment === "calendar" && oneMonth) {
      const matched = iso(year(baseline.from), month(baseline.from), day(date));
      return day(date) <= daysInMonth(year(baseline.from), month(baseline.from)) && matched <= baseline.to
        ? matched
        : null;
    }
    const matched = addDays(baseline.from, index);
    return matched <= baseline.to ? matched : null;
  });
}

/** Days at the end of a period after its latest date with rows: all of them when it has none. */
function trailingDays(range: DateRange, latest: string | null): number {
  return latest === null ? rangeLength(range) : rangeLength({ from: latest, to: range.to }) - 1;
}

/**
 * Whether the two periods' totals can be compared. Data loads in date order,
 * so a day that has not loaded yet is missing from the end of the selected
 * period, where it would read as a decline. Earlier gaps are not unloaded
 * days, so they do not hide changes. `latest` and `baselineLatest` are each
 * period's latest date with rows, or null. Position-aligned periods must also
 * have equal lengths; calendar-aligned ones (a month against the previous
 * month) may not. Returns why changes are hidden, or null when they can show.
 */
export function coverageIssue(
  range: DateRange,
  baseline: DateRange,
  latest: string | null,
  baselineLatest: string | null,
  alignment: Alignment = "position",
): string | null {
  const length = rangeLength(range);
  const baselineLength = rangeLength(baseline);
  if (alignment === "position" && length !== baselineLength)
    return `Changes are hidden because the periods differ in length: ${dayCount(length)} selected, ${dayCount(baselineLength)} compared.`;
  const missing = trailingDays(range, latest);
  const baselineMissing = trailingDays(baseline, baselineLatest);
  if (missing <= baselineMissing) return null;
  return `Changes are hidden because the selected period has no rows for its last ${dayCount(missing)}, ${baselineMissing ? `and the comparison for only its last ${dayCount(baselineMissing)}` : "while the comparison has rows through its end"}. Days missing at the end are often ones that have not loaded yet, not zeros.`;
}

/** Each period's latest date with rows, as period-sql's PERIOD_COVERAGE selects them. */
export type PeriodCoverage = {
  latest_date: string | null;
  previous_latest_date: string | null;
  second_latest_date?: string | null;
};

export type PeriodChanges = { show: boolean; issue: string | null };

/**
 * Whether a view shows period changes (KPI deltas, change columns): only with a
 * comparison period, its data (`coverage` is absent when that failed or has no
 * rows), and coverage that allows them. `issue` says why changes are hidden.
 */
export function periodChanges(
  range: DateRange,
  baseline: DateRange | null | undefined,
  coverage: PeriodCoverage | null | undefined,
  alignment: Alignment = "position",
): PeriodChanges {
  if (!baseline || !coverage) return { show: false, issue: null };
  const issue = coverageIssue(range, baseline, coverage.latest_date, coverage.previous_latest_date, alignment);
  return { show: issue === null, issue };
}

/** periodChanges() for each slot, from the coverage columns the slot's window produced. */
export function slotChanges(
  plan: ComparisonPlan,
  coverage: PeriodCoverage | null | undefined,
): [PeriodChanges, PeriodChanges] {
  const [a, b] = plan.slots;
  return [
    periodChanges(plan.range, a.range, coverage, a.alignment),
    periodChanges(
      plan.range,
      b.range,
      coverage
        ? { latest_date: coverage.latest_date, previous_latest_date: coverage.second_latest_date ?? null }
        : coverage,
      b.alignment,
    ),
  ];
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
