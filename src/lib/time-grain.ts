import { addDays, monthStart, parseChoice, weekStart, type DateRange, type SearchParams } from "./filters";

export const TIME_GRAINS = [
  { value: "day", label: "Daily" },
  { value: "week", label: "Weekly" },
  { value: "month", label: "Monthly" },
] as const;
export type TimeGrain = (typeof TIME_GRAINS)[number]["value"];

export function parseTimeGrain(params: SearchParams): TimeGrain {
  return parseChoice(
    params,
    "grain",
    TIME_GRAINS.map((item) => item.value),
    "day",
  );
}

/** Each grain as a BigQuery DATE_TRUNC part, bucketing the same way as periodStart(). */
export const GRAIN_SQL: Record<TimeGrain, string> = { day: "DAY", week: "WEEK(MONDAY)", month: "MONTH" };

/** Calendar buckets; weeks start Monday. The query still honors the selected range. */
export function periodStart(date: string, grain: TimeGrain): string {
  if (grain === "month") return monthStart(date);
  if (grain === "week") return weekStart(date);
  return date;
}

export function periodRange(start: string, grain: TimeGrain, selected: DateRange): DateRange {
  const end =
    grain === "day" ? start : grain === "week" ? addDays(start, 6) : addDays(monthStart(addDays(start, 32)), -1);
  return { from: start < selected.from ? selected.from : start, to: end > selected.to ? selected.to : end };
}
