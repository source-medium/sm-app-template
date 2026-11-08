import { MetricChart } from "@/components/charts/metric-chart";
import { retentionChart } from "./chart";
import { RETENTION_METRICS, type CohortWindow, type RetentionMetric } from "./filters";
import type { RetentionRowData } from "./rows";

type Curve = { key: RetentionMetric; description: string };

/** Each card keeps one scale: shares of the cohort, then value per original customer. */
const RATE_CURVES: Curve[] = [
  {
    key: "retention",
    description: "Share of each cohort purchasing in a month. Month 0 includes the first purchase.",
  },
  {
    key: "second",
    description: "Share of each cohort that has placed a second order by that month. Cumulative.",
  },
];
const VALUE_CURVES: Curve[] = [
  {
    key: "profit",
    description: "Cumulative gross profit per customer. Missing costs can overstate it.",
  },
  {
    key: "revenue",
    description: "Cumulative net revenue per customer, from the first purchase on.",
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
