import { addDays, parseChoice, single, type SearchParams } from "@/lib/filters";

export const COHORT_MONTHS = 12;
/** Published order-level acquisition attributes; this report excludes product and SKU slices. */
export const ACQUISITION_DIMENSIONS = [
  { value: "no_filters", label: "All acquisition orders" },
  { value: "order_type_(sub_vs._one_time)", label: "First-order type" },
  { value: "discount_code", label: "First-order discount code" },
  { value: "source/medium", label: "First-order source / medium" },
  { value: "campaign", label: "First-order campaign" },
  { value: "zero_party_attribution", label: "First-order survey attribution" },
  { value: "sub_channel", label: "First-order sub-channel" },
] as const;
export type AcquisitionDimension = (typeof ACQUISITION_DIMENSIONS)[number]["value"];
export const RETENTION_METRICS = [
  { value: "retention", label: "Monthly retention" },
  { value: "second", label: "Purchased a second time" },
  { value: "revenue", label: "Cumulative revenue / customer (LTR)" },
  { value: "profit", label: "Cumulative gross profit / customer (LTV)" },
] as const;
export type RetentionMetric = (typeof RETENTION_METRICS)[number]["value"];
export const COHORT_WINDOWS = [
  { value: "recent", label: "Latest 6 cohorts" },
  { value: "earliest", label: "Earliest 6 cohorts" },
] as const;
export type CohortWindow = (typeof COHORT_WINDOWS)[number]["value"];

/** Calendar months, including years below 100 (Date.UTC would reinterpret those as 1900+). */
export function shiftMonth(month: string, offset: number): string {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
/** `today` is the store's date; the latest selectable cohort month is the last complete one. */
export function retentionOptions(params: SearchParams, today: string) {
  const maxMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  const value = single(params, "as_of");
  const asOf =
    value && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= "0002-01" && value <= maxMonth ? value : maxMonth;
  const dimension = parseChoice(
    params,
    "acquisition_dimension",
    ACQUISITION_DIMENSIONS.map((item) => item.value),
    "no_filters",
  );
  return {
    asOf,
    maxMonth,
    channel: single(params, "channel")?.slice(0, 100) || "online_dtc",
    dimension,
    segment: dimension === "no_filters" ? null : single(params, "acquisition_segment") || null,
    segmentSearch: single(params, "segment_search")?.slice(0, 200) || "",
    curveWindow: parseChoice(
      params,
      "cohorts",
      COHORT_WINDOWS.map((item) => item.value),
      "recent",
    ),
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
