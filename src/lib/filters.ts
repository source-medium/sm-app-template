/**
 * Report filters live in the URL (?store=&from=&to=), so a reload keeps the
 * view and a shared link shares it. Server components parse them with this
 * module; there is no client data layer.
 *
 * Dates are calendar dates (YYYY-MM-DD) in UTC. The range ends no later than
 * today, so forward-dated target rows never appear as zero-valued days.
 */
import { appConfig } from "@/app.config";

export type SearchParams = Record<string, string | string[] | undefined>;
export type DateRange = { from: string; to: string };
export type ReportFilters = { storeId: string; range: DateRange };

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 86_400_000;

export function todayUtc(now: Date): string {
  return now.toISOString().slice(0, 10);
}

export function addDays(date: string, days: number): string {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

/** Inclusive day count of a range. */
export function rangeLength(range: DateRange): number {
  return Math.round((Date.parse(`${range.to}T00:00:00Z`) - Date.parse(`${range.from}T00:00:00Z`)) / DAY_MS) + 1;
}

export function datesInRange(range: DateRange): string[] {
  const dates: string[] = [];
  for (let date = range.from; date <= range.to; date = addDays(date, 1)) dates.push(date);
  return dates;
}

function isCalendarDate(value: string | undefined): value is string {
  if (!value || !DATE.test(value)) return false;
  const time = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(time) && new Date(time).toISOString().slice(0, 10) === value;
}

export function single(params: SearchParams, name: string): string | undefined {
  const value = params[name];
  return Array.isArray(value) ? value[0] : value;
}

export function defaultRange(now: Date): DateRange {
  const to = addDays(todayUtc(now), -1);
  return { from: addDays(to, -(appConfig.dateRange.defaultDays - 1)), to };
}

/**
 * The applied range: the URL's range when it is valid, otherwise the default.
 * The end is clamped to today and the length to the configured maximum.
 */
export function parseDateRange(params: SearchParams, now: Date): DateRange {
  const fallback = defaultRange(now);
  const today = todayUtc(now);
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

/** The selected store, or the first store when none (or an unknown one) is selected. */
export function parseStore(params: SearchParams, storeIds: readonly string[]): string | null {
  const requested = single(params, "store");
  if (requested && storeIds.includes(requested)) return requested;
  return storeIds[0] ?? null;
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

/** The parameters to carry into another filter form on the same view. */
export function preservedParams(
  params: SearchParams,
  names: readonly string[],
  applied: ReportFilters,
): Record<string, string> {
  const preserved: Record<string, string> = { store: applied.storeId, from: applied.range.from, to: applied.range.to };
  for (const name of names) {
    const value = single(params, name);
    if (value !== undefined) preserved[name] = value;
  }
  return preserved;
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
