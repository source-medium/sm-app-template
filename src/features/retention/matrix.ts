import type { CohortCell } from "@/components/patterns/cohort-matrix";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { formatMeasure, formatMoney, formatMonth, formatPercent } from "@/lib/format";
import { COHORT_MONTHS, cohortMonths, monthIsElapsed, type RetentionMetric } from "./filters";
import type { RetentionRowData } from "./rows";

export function cohortValue(row: RetentionRowData, metric: RetentionMetric): number | null {
  const size = decimalToNumber(row.cohort_size);
  if (size === null || size <= 0) return null;
  return ratio(
    decimalToNumber(
      metric === "retention" ? row.customers : metric === "revenue" ? row.cumulative_revenue : row.cumulative_profit,
    ),
    size,
  );
}

export function retentionMatrix(rows: RetentionRowData[], channel: string, metric: RetentionMetric, asOf: string) {
  const selected = rows.filter((row) => row.channel === channel);
  const byKey = new Map(selected.map((row) => [`${row.cohort_month}|${row.month_age}`, row]));
  const maximum = Math.max(0, ...selected.map((row) => cohortValue(row, metric) ?? 0));
  const format = metric === "retention" ? formatPercent : formatMoney;
  return cohortMonths(asOf).map((cohort) => {
    const first = selected.find((row) => row.cohort_month === cohort);
    return {
      id: cohort,
      label: formatMonth(cohort),
      size: first ? formatMeasure(first.cohort_size) : "No data",
      cells: Array.from({ length: COHORT_MONTHS }, (_, age): CohortCell => {
        if (!monthIsElapsed(cohort, age, asOf))
          return { display: "—", description: "Not yet elapsed", intensity: null, state: "immature" };
        const row = byKey.get(`${cohort}|${age}`);
        const value = row ? cohortValue(row, metric) : null;
        if (value === null)
          return { display: "No data", description: "No published value", intensity: null, state: "missing" };
        return {
          display: format(value),
          description: format(value),
          intensity: value < 0 ? null : metric === "retention" ? value : maximum > 0 ? value / maximum : 0,
          state: "value",
        };
      }),
    };
  });
}
