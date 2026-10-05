/**
 * Server-side formatting. Numbers and dates are formatted on the server and
 * sent as strings, so the browser and the server can never disagree and no
 * hydration warning can appear. Do not format in client components.
 */
import "server-only";
import { appConfig } from "@/app.config";

const integer = new Intl.NumberFormat(appConfig.locale, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(appConfig.locale, { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat(appConfig.locale, { style: "percent", maximumFractionDigits: 2 });
const compact = new Intl.NumberFormat(appConfig.locale, { notation: "compact", maximumFractionDigits: 1 });
const shortDate = new Intl.DateTimeFormat(appConfig.locale, { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat(appConfig.locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const clock = new Intl.DateTimeFormat(appConfig.locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
  timeZoneName: "short",
});

export const EMPTY_VALUE = "—";

const money = new Intl.NumberFormat(
  appConfig.locale,
  appConfig.currency
    ? { style: "currency", currency: appConfig.currency }
    : { minimumFractionDigits: 2, maximumFractionDigits: 2 },
);

/**
 * Money in the reporting currency. NUMERIC text is formatted exactly (no
 * float rounding); ratios such as AOV arrive as numbers.
 */
export function formatMoney(value: string | number | null): string {
  if (value === null) return EMPTY_VALUE;
  return typeof value === "string" ? money.format(value as `${number}`) : money.format(value);
}

/** A multiple such as MER or ROAS: 3.42x. */
export function formatMultiple(value: number | null): string {
  return value === null || !Number.isFinite(value) ? EMPTY_VALUE : `${decimal.format(value)}x`;
}

/** Exact integers (INT64 as bigint) keep every digit. */
export function formatCount(value: bigint | number | null): string {
  if (value === null) return EMPTY_VALUE;
  return integer.format(value);
}

/** A FLOAT64 measure: whole numbers without decimals, fractional ones to two places. */
export function formatMeasure(value: number | null): string {
  if (value === null) return EMPTY_VALUE;
  return Number.isInteger(value) ? integer.format(value) : decimal.format(value);
}

export function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? EMPTY_VALUE : percent.format(value);
}

export function formatCompact(value: number): string {
  return compact.format(value);
}

/** A warehouse DATE ("2026-10-04"), shown as a calendar date in no time zone. */
export function formatDay(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00Z`));
}

export function formatDate(date: string): string {
  return longDate.format(new Date(`${date}T00:00:00Z`));
}

export function formatInstant(iso: string): string {
  return clock.format(new Date(iso));
}

const wallTime = new Intl.DateTimeFormat(appConfig.locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "UTC",
});

/** A warehouse DATETIME (store-local wall time with no zone), shown exactly as recorded. */
export function formatWallTime(datetime: string | null): string {
  return datetime ? wallTime.format(new Date(`${datetime.slice(0, 19)}Z`)) : EMPTY_VALUE;
}
