/**
 * Report filters live in the URL (?store=&from=&to=), so a reload keeps the
 * view and a shared link shares it. Server components parse them with this
 * module; there is no client data layer.
 *
 * Dates are calendar dates (YYYY-MM-DD). `today` is the store's date in its
 * SourceMedium time zone (ReportContext.today; resolveReportStore finds the zone).
 * The range ends no later than today, so forward-dated target rows never
 * appear as zero-valued days.
 */
import { appConfig } from "@/app.config";

export const REPORT_FILTER_FORM_ID = "report-filters";

export type SearchParams = Record<string, string | string[] | undefined>;
export type DateRange = { from: string; to: string };
export type ReportFilters = { storeId: string; range: DateRange };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
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
  return single(params, "sales_channel")?.slice(0, 100) || null;
}

export function defaultRange(today: string): DateRange {
  const to = addDays(today, -1);
  return { from: addDays(to, -(appConfig.dateRange.defaultDays - 1)), to };
}

/** Completed calendar periods relative to today. Weeks run Monday–Sunday. */
export function datePresets(today: string): { label: string; range: DateRange }[] {
  const yesterday = addDays(today, -1);
  const monthStart = `${today.slice(0, 8)}01`;
  const lastMonthEnd = addDays(monthStart, -1);
  const monday = addDays(today, -((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7));
  const presets = [
    { label: "Yesterday", range: { from: yesterday, to: yesterday } },
    ...[7, 28, 90].map((days) => ({
      label: `Last ${days} days`,
      range: { from: addDays(yesterday, -(days - 1)), to: yesterday },
    })),
    { label: "Last full week", range: { from: addDays(monday, -7), to: addDays(monday, -1) } },
    { label: "Last month", range: { from: `${lastMonthEnd.slice(0, 8)}01`, to: lastMonthEnd } },
    // On the first of the month there are no completed days in this month yet.
    ...(yesterday >= monthStart ? [{ label: "Month to date", range: { from: monthStart, to: yesterday } }] : []),
  ];
  return presets.filter((preset) => rangeLength(preset.range) <= appConfig.dateRange.maxDays);
}

/**
 * The applied range: the URL's range when it is valid, otherwise the default.
 * The end is clamped to today and the length to the configured maximum.
 */
export function parseDateRange(params: SearchParams, today: string): DateRange {
  const fallback = defaultRange(today);
  const fromParam = single(params, "from");
  const toParam = single(params, "to");
  if (!isCalendarDate(fromParam) || !isCalendarDate(toParam) || fromParam > toParam) return fallback;
  const to = toParam > today ? today : toParam;
  if (fromParam > to) return fallback;
  const range = { from: fromParam, to };
  return rangeLength(range) > appConfig.dateRange.maxDays
    ? { from: addDays(to, -(appConfig.dateRange.maxDays - 1)), to }
    : range;
}

/** A supplied URL must never silently report a different period. Missing dates use the default. */
export function dateRangeIssue(params: SearchParams, today: string): string | null {
  const from = single(params, "from");
  const to = single(params, "to");
  if (from === undefined && to === undefined) return null;
  if (!isCalendarDate(from) || !isCalendarDate(to)) return "Choose a valid start and end date.";
  if (from > to) return "The start date must be on or before the end date.";
  if (to > today) return "The end date cannot be after today.";
  if (rangeLength({ from, to }) > appConfig.dateRange.maxDays)
    return `Choose a range of ${appConfig.dateRange.maxDays} days or fewer.`;
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
