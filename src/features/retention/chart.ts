import { buildChartData } from "@/components/charts/chart-data";
import { COHORT_MONTHS, type CohortWindow, type RetentionMetric } from "./filters";
import { retentionMatrix } from "./matrix";
import type { RetentionRowData } from "./rows";

/** Curves and the matrix share values, denominators, age eligibility and missing-value handling. */
export function retentionChart(
  rows: RetentionRowData[],
  channel: string,
  metric: RetentionMetric,
  asOf: string,
  window: CohortWindow,
) {
  const cohorts = retentionMatrix(rows, channel, metric, asOf).slice(
    window === "recent" ? -6 : 0,
    window === "recent" ? undefined : 6,
  );
  const series = cohorts.map((cohort, index) => ({
    key: `cohort_${index}`,
    label: cohort.label,
    color: `var(--chart-${index + 1})`,
  }));
  const chart = buildChartData(
    Array.from({ length: COHORT_MONTHS }, (_, age) => ({
      label: `Month ${age}`,
      values: Object.fromEntries(
        cohorts.map((cohort, index) => {
          const cell = cohort.cells[age];
          return [`cohort_${index}`, { value: cell?.value ?? null, display: cell?.display ?? "No data" }];
        }),
      ),
    })).filter((_, age) => cohorts.some((cohort) => cohort.cells[age]?.state !== "immature")),
  );
  return { ...chart, series };
}
