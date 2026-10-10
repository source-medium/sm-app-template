/**
 * Server-side formatting. Numbers and dates are formatted on the server and
 * sent as strings, so the browser and the server can never disagree and no
 * hydration warning can appear. Do not format in client components.
 */
import "server-only";
import { appConfig } from "@/app.config";
import { fromUnits, toUnits } from "@/lib/data/decimal";

const integer = new Intl.NumberFormat(appConfig.locale, { maximumFractionDigits: 0 });
const decimal = new Intl.NumberFormat(appConfig.locale, { maximumFractionDigits: 2 });
const percent = new Intl.NumberFormat(appConfig.locale, { style: "percent", maximumFractionDigits: 2 });
const changePercent = new Intl.NumberFormat(appConfig.locale, {
  style: "percent",
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});
const shortDate = new Intl.DateTimeFormat(appConfig.locale, { month: "short", day: "numeric", timeZone: "UTC" });
const longDate = new Intl.DateTimeFormat(appConfig.locale, {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const monthDate = new Intl.DateTimeFormat(appConfig.locale, { year: "numeric", month: "short", timeZone: "UTC" });

export const EMPTY_VALUE = "—";

/** A warehouse code such as "repeat", "paid", or "online_dtc" as a readable label. */
export function formatLabel(value: string | null): string {
  const text = value?.trim().replace(/_/g, " ") ?? "";
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : EMPTY_VALUE;
}

const moneyFormatters = new Map<string, Intl.NumberFormat>();

function moneyFormatter(currency: string | null): Intl.NumberFormat {
  const key = currency ?? "";
  const cached = moneyFormatters.get(key);
  if (cached) return cached;
  const formatter = new Intl.NumberFormat(
    appConfig.locale,
    currency
      ? { style: "currency", currency, signDisplay: "negative" }
      : { minimumFractionDigits: 2, maximumFractionDigits: 2, signDisplay: "negative" },
  );
  moneyFormatters.set(key, formatter);
  return formatter;
}

/**
 * Money in `currency`, the selected store's code (ReportContext.currency).
 * Callers outside a report, including tests, use `app.config.ts` `currency`.
 * NUMERIC text is formatted exactly (no float rounding); ratios such as AOV
 * arrive as numbers. This labels amounts; it does not convert them.
 */
export function formatMoney(value: string | number | null, currency: string | null = appConfig.currency): string {
  if (value === null || (typeof value === "number" && !Number.isFinite(value))) return EMPTY_VALUE;
  const money = moneyFormatter(currency);
  return typeof value === "string" ? money.format(value as `${number}`) : money.format(value);
}

/** A one-argument formatter bound to one store's currency, for kpiDelta and rankings. */
export function formatMoneyIn(currency: string | null): (value: string | number | null) => string {
  return (value) => formatMoney(value, currency);
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

/** A decimal or FLOAT64 measure, to two places. Decimal text retains its integer precision. */
export function formatMeasure(value: string | number | null): string {
  if (value === null) return EMPTY_VALUE;
  if (typeof value === "string") return decimal.format(value as `${number}`);
  return Number.isInteger(value) ? integer.format(value) : decimal.format(value);
}

export function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? EMPTY_VALUE : percent.format(value);
}

/** Input is already a percentage, preserving exact decimal comparison results. */
export function formatChangePercent(value: string | number): string {
  return typeof value === "string"
    ? changePercent.format(fromUnits(toUnits(value) / 100n) as `${number}`)
    : changePercent.format(value / 100);
}

/** A warehouse DATE ("2026-10-04"), shown as a calendar date in no time zone. */
export function formatDay(date: string): string {
  return shortDate.format(new Date(`${date}T00:00:00Z`));
}

export function formatDate(date: string): string {
  return longDate.format(new Date(`${date}T00:00:00Z`));
}

export function formatMonth(date: string): string {
  return monthDate.format(new Date(`${date}T00:00:00Z`));
}

const clocks = new Map<string, Intl.DateTimeFormat>();

/** A moment in the store's time zone (ReportContext.timeZone), named, so it is never mistaken for UTC. */
export function formatInstant(iso: string, timeZone: string, includeSeconds = false): string {
  const key = `${timeZone}|${includeSeconds}`;
  let clock = clocks.get(key);
  if (!clock) {
    clock = new Intl.DateTimeFormat(appConfig.locale, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      ...(includeSeconds ? { second: "2-digit" } : {}),
      timeZone,
      timeZoneName: "short",
    });
    clocks.set(key, clock);
  }
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

/** The calendar date (YYYY-MM-DD) at an instant in a time zone: an IANA name or an offset such as "-07:00". */
export function calendarDate(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(now)
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  return `${parts.year?.padStart(4, "0")}-${parts.month}-${parts.day}`;
}

/** Whether calendarDate accepts this time zone. */
export function isTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}

/** Whether Intl can format this ISO 4217 code. Callers uppercase and trim first. */
export function isCurrency(code: string): boolean {
  try {
    new Intl.NumberFormat("en-US", { style: "currency", currency: code });
    return true;
  } catch (error) {
    if (error instanceof RangeError) return false;
    throw error;
  }
}
