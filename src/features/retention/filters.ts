import { addDays, parseChoice, single, todayUtc, type SearchParams } from "@/lib/filters";

export const COHORT_MONTHS = 12;
export const RETENTION_METRICS = [
  { value: "retention", label: "Monthly retention" },
  { value: "revenue", label: "Cumulative revenue / customer (LTR)" },
  { value: "profit", label: "Cumulative gross profit / customer (LTV)" },
] as const;
export type RetentionMetric = (typeof RETENTION_METRICS)[number]["value"];

/** Calendar months, including years below 100 (Date.UTC would reinterpret those as 1900+). */
export function shiftMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
export function retentionOptions(params: SearchParams, now: Date) {
  const maxMonth = addDays(`${todayUtc(now).slice(0, 7)}-01`, -1).slice(0, 7);
  const value = single(params, "as_of");
  const asOf =
    value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= "0002-01" && value <= maxMonth ? value : maxMonth;
  return {
    asOf,
    maxMonth,
    channel: single(params, "channel")?.slice(0, 100) || "online_dtc",
    metric: parseChoice(
      params,
      "measure",
      RETENTION_METRICS.map((item) => item.value),
      "retention",
    ),
  };
}
export function cohortMonths(asOf: string): string[] {
  return Array.from({ length: COHORT_MONTHS }, (_, index) => `${shiftMonth(asOf, index - COHORT_MONTHS + 1)}-01`);
}

export function monthIsElapsed(cohort: string, age: number, asOf: string): boolean {
  return shiftMonth(cohort.slice(0, 7), age) <= asOf;
}
