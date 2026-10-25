import { MetricChart } from "@/components/charts/metric-chart";
import { retentionChart } from "./chart";
import { RETENTION_METRICS, type CohortWindow, type RetentionMetric } from "./filters";
import type { RetentionRowData } from "./rows";

type Curve = { key: RetentionMetric; description: string };

/** Each card keeps one scale: shares of the cohort, then value per original customer. */
const RATE_CURVES: Curve[] = [
  {
    key: "retention",
    description:
      "Purchasing customers in each month / original cohort size. Month 0 includes the acquisition purchase. Each line is one cohort, with no averages across cohorts.",
  },
  {
    key: "second",
    description:
      "Customers who have placed a second order by each month of age / original cohort size. Cumulative, including second orders in Month 0. Each line is one cohort, with no averages across cohorts.",
  },
];
const VALUE_CURVES: Curve[] = [
  {
    key: "profit",
    description:
      "Cumulative gross profit / original cohort size, in reporting currency. Includes acquisition purchases and published costs; missing costs can overstate LTV.",
  },
  {
    key: "revenue",
    description:
      "Cumulative net revenue / original cohort size, in reporting currency. Includes the acquisition month and every later month through each age.",
  },
];

export function RetentionCurves({
  rows,
  channel,
  asOf,
  window,
  currency,
}: {
  rows: RetentionRowData[];
  channel: string;
  asOf: string;
  window: CohortWindow;
  currency: string | null;
}) {
  const curves = (list: Curve[], valueFormat: "number" | "percent") =>
    list.map((curve) => ({
      ...curve,
      label: RETENTION_METRICS.find((metric) => metric.value === curve.key)?.chartLabel ?? curve.key,
      valueFormat,
      ...retentionChart(rows, channel, curve.key, asOf, window, currency),
    }));
  return (
    <section aria-label="Retention and lifetime value curves" className="grid min-w-0 gap-6 xl:grid-cols-2">
      <MetricChart
        param="rate_curve"
        titleSuffix="by cohort age"
        kind="line"
        categoryHeader="Cohort age"
        showPoints
        metrics={curves(RATE_CURVES, "percent")}
      />
      <MetricChart
        param="value_curve"
        titleSuffix="by cohort age"
        kind="line"
        categoryHeader="Cohort age"
        showPoints
        metrics={curves(VALUE_CURVES, "number")}
      />
    </section>
  );
}
