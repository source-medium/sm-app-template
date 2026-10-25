import { addDays, parseChoice, single, type SearchParams } from "@/lib/filters";

export const COHORT_MONTHS = 12;
/** The earliest cohort month the URL and the month control accept (Date.UTC would reinterpret years below 100). */
export const MIN_COHORT_MONTH = "0002-01";
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
/** `chartLabel` names the measure in a curve's title menu. */
export const RETENTION_METRICS = [
  { value: "retention", label: "Monthly retention", chartLabel: "Retention" },
  { value: "second", label: "Purchased a second time", chartLabel: "Second-purchase rate" },
  { value: "revenue", label: "Cumulative revenue / customer (LTR)", chartLabel: "Revenue LTR" },
  { value: "profit", label: "Cumulative gross profit / customer (LTV)", chartLabel: "Gross profit LTV" },
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
/**
 * `today` is the store's date; the latest selectable cohort month is the last complete one.
 * A supplied `as_of` that cannot be used sets `asOfIssue`, so a shared link never
 * silently shows a different month; the controls then suggest the latest complete one.
 */
export function retentionOptions(params: SearchParams, today: string) {
  const maxMonth = addDays(`${today.slice(0, 7)}-01`, -1).slice(0, 7);
  // An absent or empty as_of means "the latest complete month", like a missing date range.
  const value = single(params, "as_of") || undefined;
  const wellFormed = value !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/.test(value) && value >= MIN_COHORT_MONTH;
  const usable = wellFormed && value <= maxMonth;
  const asOf = usable ? value : maxMonth;
  const asOfIssue =
    value === undefined || usable
      ? null
      : wellFormed
        ? "Choose a month that has already ended."
        : "Choose a valid month.";
  const dimension = parseChoice(
    params,
    "acquisition_dimension",
    ACQUISITION_DIMENSIONS.map((item) => item.value),
    "no_filters",
  );
  return {
    asOf,
    asOfIssue,
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
