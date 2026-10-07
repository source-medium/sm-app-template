import { ChartCard } from "@/components/charts/chart-card";
import { retentionChart } from "./chart";
import type { CohortWindow } from "./filters";
import type { RetentionRowData } from "./rows";

export function RetentionCurves({
  rows,
  channel,
  asOf,
  window,
}: {
  rows: RetentionRowData[];
  channel: string;
  asOf: string;
  window: CohortWindow;
}) {
  return (
    <section aria-label="Retention and lifetime value curves" className="grid min-w-0 gap-6 xl:grid-cols-2">
      <ChartCard
        title="Retention by cohort age"
        description="Purchasing customers in each month / original cohort size. Month 0 includes the acquisition purchase. Each line is one cohort, with no averages across cohorts."
        kind="line"
        categoryHeader="Cohort age"
        valueFormat="percent"
        showPoints
        {...retentionChart(rows, channel, "retention", asOf, window)}
      />
      <ChartCard
        title="Gross profit LTV by cohort age"
        description="Cumulative gross profit / original cohort size, in reporting currency. Includes acquisition purchases and published costs; missing costs can overstate LTV."
        kind="line"
        categoryHeader="Cohort age"
        showPoints
        {...retentionChart(rows, channel, "profit", asOf, window)}
      />
    </section>
  );
}
