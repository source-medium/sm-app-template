import { addDays, parseChoice, type DateRange, type SearchParams } from "./filters";

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

/** Calendar buckets; weeks start Monday. The query still honors the selected range. */
export function periodStart(date: string, grain: TimeGrain): string {
  if (grain === "month") return `${date.slice(0, 8)}01`;
  if (grain === "week") return addDays(date, -((new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7));
  return date;
}

export function periodRange(start: string, grain: TimeGrain, selected: DateRange): DateRange {
  const end =
    grain === "day" ? start : grain === "week" ? addDays(start, 6) : addDays(`${addDays(start, 32).slice(0, 8)}01`, -1);
  return { from: start < selected.from ? selected.from : start, to: end > selected.to ? selected.to : end };
}
