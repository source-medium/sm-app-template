/**
 * Report filters live in the URL (?store=&from=&to=), so a reload keeps the
 * view and a shared link shares it. Server components parse them with this
 * module; there is no client data layer. A date preset is `?range=last-28-days`
 * instead, so a bookmark keeps rolling with today; explicit dates win over it.
 *
 * Dates are calendar dates (YYYY-MM-DD). `today` is the store's date in its
 * SourceMedium time zone (ReportContext.today; resolveReportStore finds the zone).
 * The range ends no later than today, so forward-dated target rows never
 * appear as zero-valued days.
 */
import { appConfig } from "@/app.config";

export const REPORT_FILTER_FORM_ID = "report-filters";

/** The filters every view shares: the same store, dates and comparisons carry across views. */
export const SHARED_FILTERS = ["store", "from", "to", "range", "compare", "compare2"] as const;

export type SearchParams = Record<string, string | string[] | undefined>;
export type DateRange = { from: string; to: string };
export type ReportFilters = { storeId: string; range: DateRange };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** The Monday starting `date`'s week. */
export function weekStart(date: string): string {
  return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
}

export function monthStart(date: string): string {
  return `${date.slice(0, 8)}01`;
}

export function quarterStart(date: string): string {
  return `${date.slice(0, 5)}${String(Math.floor((Number(date.slice(5, 7)) - 1) / 3) * 3 + 1).padStart(2, "0")}-01`;
}

/** Inclusive day count of a range. */
export function rangeLength(range: DateRange): number {
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / DAY_MS) + 1;
}

/** The latest of some calendar dates, or null for none. */
export function latestDate(dates: Iterable<string>): string | null {
  let latest: string | null = null;
  for (const date of dates) if (latest === null || date > latest) latest = date;
  return latest;
}

export function datesInRange(range: DateRange): string[] {
  const dates: string[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function isCalendarDate(value: string | undefined): value is string {
  if (!value || !DATE.test(value) || value < "0001-01-01") return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function single(params: SearchParams, name: string): string | undefined {
  const value = params[name];
  return Array.isArray(value) ? value[0] : value;
}

/** Sales-channel values are data, never SQL identifiers. Keep unknown choices explicit. */
export function parseSalesChannel(params: SearchParams): string | null {
  const value = single(params, "sales_channel");
  if (value === undefined) return null;
  if (!value) return null;
  if (value.startsWith("[")) {
    const channels = salesChannelValues(value);
    // Invalid selections stay an explicit unknown choice, never silently widen to all channels.
    return encodeSalesChannels(channels);
  }
  return value.slice(0, 100);
}

export function defaultRange(today: string): DateRange {
  const to = addDays(today, -1);
  return { from: addDays(to, -(appConfig.dateRange.defaultDays - 1)), to };
}

/** Calendar periods a preset can name. Weeks run Monday–Sunday. */
export type DatePeriod = "week" | "month" | "quarter" | "year";
export const PERIOD_START: Record<DatePeriod, (date: string) => string> = {
  week: weekStart,
  month: monthStart,
  quarter: quarterStart,
  year: (date) => `${date.slice(0, 4)}-01-01`,
};

/**
 * Completed days relative to today: the last `days` days, the last full
 * `period`, or the `period` to date. To date runs from the start of the period
 * holding yesterday through yesterday, so on a period's first day it is the
 * whole period that just ended, never empty.
 */
export type DatePreset = { value: string; label: string } & (
  { days: number } | { period: DatePeriod; toDate: boolean }
);

/**
 * The presets, in the order the filter bar lists them. A URL names one as
 * `range=<value>`, so a bookmark keeps meaning "last 28 days" rather than the
 * dates it first showed, and comparisons follow the preset's own period.
 */
const DATE_PRESETS: readonly DatePreset[] = [
  { value: "yesterday", label: "Yesterday", days: 1 },
  ...[7, 14, 28, 30, 90, 365].map((days) => ({ value: `last-${days}-days`, label: `Last ${days} days`, days })),
  { value: "week-to-date", label: "Week to date", period: "week", toDate: true },
  { value: "last-week", label: "Last week", period: "week", toDate: false },
  { value: "month-to-date", label: "Month to date", period: "month", toDate: true },
  { value: "last-month", label: "Last month", period: "month", toDate: false },
  { value: "quarter-to-date", label: "Quarter to date", period: "quarter", toDate: true },
  { value: "last-quarter", label: "Last quarter", period: "quarter", toDate: false },
  { value: "year-to-date", label: "Year to date", period: "year", toDate: true },
  { value: "last-year", label: "Last year", period: "year", toDate: false },
];
/** The default range as a preset, when one has `dateRange.defaultDays`. */
const DEFAULT_PRESET = DATE_PRESETS.find(
  (preset) => "days" in preset && preset.days === appConfig.dateRange.defaultDays,
);

/** A preset's dates as of `today`. */
export function presetRange(preset: DatePreset, today: string): DateRange {
  const yesterday = addDays(today, -1);
  if ("days" in preset) return { from: addDays(yesterday, -(preset.days - 1)), to: yesterday };
  const start = PERIOD_START[preset.period];
  if (preset.toDate) return { from: start(yesterday), to: yesterday };
  const end = addDays(start(today), -1);
  return { from: start(end), to: end };
}

/** The presets that fit the report's maximum range, with their dates today. */
export function datePresets(
  today: string,
  maxDays = appConfig.dateRange.maxDays,
): { value: string; label: string; range: DateRange }[] {
  return DATE_PRESETS.flatMap((preset) => {
    const range = presetRange(preset, today);
    return rangeLength(range) <= maxDays ? [{ value: preset.value, label: preset.label, range }] : [];
  });
}

/** Whether the URL fixes its dates; otherwise they roll with today (a `range` preset or the default). */
export function hasFixedDates(params: SearchParams): boolean {
  return single(params, "from") !== undefined || single(params, "to") !== undefined;
}

/**
 * The preset the applied range is: the URL's `range` (without one or fixed
 * dates, the default), when its dates as of the day after the range ends are
 * exactly the range. A rolling preset is always itself; fixed dates keep the
 * preset they were copied with, but not once edited to other dates.
 */
export function rangePreset(params: SearchParams, range: DateRange): DatePreset | undefined {
  const named = single(params, "range");
  const preset =
    named === undefined
      ? hasFixedDates(params)
        ? undefined
        : DEFAULT_PRESET
      : DATE_PRESETS.find((preset) => preset.value === named);
  const dates = preset && presetRange(preset, addDays(range.to, 1));
  return dates && dates.from === range.from && dates.to === range.to ? preset : undefined;
}

/** A report's dates as URL parameters; null removes one. */
export type DateParams = { from: string | null; to: string | null; range: string | null };

/**
 * How a report's dates travel in links. `live` continues the report: a preset
 * or the default keeps rolling and fixed dates stay fixed. `fixed` shows exactly
 * this period (shared links, downloads, rows compared across stores), naming
 * the preset it is so comparisons keep that meaning.
 */
export type ReportDates = { rolling: boolean; preset: string | null; live: DateParams; fixed: DateParams };

/** `issue` is the range's dateRangeIssue(); a range that needs fixing travels as its suggested dates. */
export function reportDates(params: SearchParams, range: DateRange, issue: string | null): ReportDates {
  const preset = issue === null ? (rangePreset(params, range)?.value ?? null) : null;
  const rolling = issue === null && !hasFixedDates(params);
  const fixed = { from: range.from, to: range.to, range: preset };
  // The default keeps links free of dates; only a preset the URL names travels.
  const named = single(params, "range") === undefined ? null : preset;
  return { rolling, preset, fixed, live: rolling ? { from: null, to: null, range: named } : fixed };
}

/** Params with a report's dates in place of any they had. */
export function withDates(params: SearchParams, dates: DateParams): SearchParams {
  return { ...params, from: dates.from ?? undefined, to: dates.to ?? undefined, range: dates.range ?? undefined };
}

/** The URL's fixed dates; otherwise the dates its `range` preset names today. */
function requestedDates(params: SearchParams, today: string): { from?: string; to?: string } {
  if (hasFixedDates(params)) return { from: single(params, "from"), to: single(params, "to") };
  const preset = DATE_PRESETS.find((preset) => preset.value === single(params, "range"));
  return preset ? presetRange(preset, today) : {};
}

/**
 * The applied range: the URL's range when it is valid, otherwise the default.
 * The end is clamped to today and the length to the configured maximum.
 */
export function parseDateRange(params: SearchParams, today: string, maxDays = appConfig.dateRange.maxDays): DateRange {
  const fallback = defaultRange(today);
  const { from: fromParam, to: toParam } = requestedDates(params, today);
  if (!isCalendarDate(fromParam) || !isCalendarDate(toParam) || fromParam > toParam) return fallback;
  const to = toParam > today ? today : toParam;
  if (fromParam > to) return fallback;
  const range = { from: fromParam, to };
  return rangeLength(range) > maxDays ? { from: addDays(to, -(maxDays - 1)), to } : range;
}

/** A supplied URL must never silently report a different period. Missing dates use the default. */
export function dateRangeIssue(
  params: SearchParams,
  today: string,
  maxDays = appConfig.dateRange.maxDays,
): string | null {
  const { from, to } = requestedDates(params, today);
  // Without dates, only a `range` the app does not offer needs fixing.
  if (from === undefined && to === undefined)
    return single(params, "range") === undefined ? null : "Choose one of the offered date ranges.";
  if (!isCalendarDate(from) || !isCalendarDate(to)) return "Choose a valid start and end date.";
  if (from > to) return "The start date must be on or before the end date.";
  if (to > today) return "The end date cannot be after today.";
  if (rangeLength({ from, to }) > maxDays) return `Choose a range of ${maxDays} days or fewer.`;
  return null;
}

/** A link to the same view with some parameters changed; null removes one. */
export function withParams(pathname: string, params: SearchParams, changes: Record<string, string | null>): string {
  const next = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    const first = Array.isArray(value) ? value[0] : value;
    if (first !== undefined) next.set(key, first);
  }
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) next.delete(key);
    else next.set(key, value);
  }
  const query = next.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/** One value from a fixed set, or the default. Browser input never becomes an identifier. */
export function parseChoice<T extends string>(
  params: SearchParams,
  name: string,
  choices: readonly T[],
  fallback: T,
): T {
  const value = single(params, name);
  return choices.find((choice) => choice === value) ?? fallback;
}

/** One channel, or a JSON list of several, in the same shareable URL parameter. */
export function salesChannelValues(value: string | null | undefined): string[] {
  if (!value) return [];
  if (value.startsWith("[") && value.length <= 6000) {
    try {
      const items: unknown = JSON.parse(value);
      if (
        Array.isArray(items) &&
        items.length > 0 &&
        items.length <= 50 &&
        items.every((item) => typeof item === "string" && item.length > 0 && item.length <= 100)
      )
        return [...new Set(items as string[])].sort();
    } catch {
      /* Keep an invalid choice explicit below. */
    }
  }
  return [value.slice(0, 100)];
}
export function encodeSalesChannels(channels: readonly string[]): string | null {
  const values = [...new Set(channels)].sort();
  const first = values[0];
  return first === undefined ? null : values.length === 1 && !first.startsWith("[") ? first : JSON.stringify(values);
}
export function matchesSalesChannel(selection: string | null | undefined, channel: string | null | undefined): boolean {
  const values = salesChannelValues(selection);
  return values.length === 0 || values.includes(channel ?? "(none)");
}
/** A channel scope as report copy names it: no selection means every sales channel. */
export function salesChannelLabel(selection: string | null | undefined): string {
  return salesChannelValues(selection).join(", ") || "All sales channels";
}
export function summarySalesChannel(params: SearchParams): string | null {
  return single(params, "sales_channel") === undefined
    ? encodeSalesChannels(appConfig.defaultSalesChannels)
    : parseSalesChannel(params);
}
