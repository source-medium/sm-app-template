/**
 * The six overview measures, formatted once for the KPI cards and the summary
 * table. Descriptions and sparklines stay with the card. CSV export stays raw.
 */
import "server-only";
import { overviewBindings } from "./metrics";
import type { MetricValue, Polarity } from "@/lib/comparison";
import { toChartNumber } from "@/lib/data/decode";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { formatCount, formatMeasure, formatMetricValue, formatMoney, formatMultiple } from "@/lib/format";
import type { OverviewMeasures } from "./queries";

export const OVERVIEW_MEASURE_KEYS = ["revenue", "orders", "average", "spend", "mer", "sessions"] as const;
export type OverviewMeasureKey = (typeof OVERVIEW_MEASURE_KEYS)[number];

export type PresentedMeasure = {
  display: string;
  /** Table sort value. Unsafe integers sort as missing rather than a rounded count. */
  sort: number | null;
  /** Exact amount for kpiDelta. Money stays decimal text. */
  amount: MetricValue | null;
  format: (value: MetricValue | null) => string;
  /** Which way is good; see Polarity. Spend is neither on its own; MER says whether it paid off. */
  better: Polarity;
  /** Adds up across days. A ratio (revenue per order, MER) does not; it divides its own totals. */
  additive: boolean;
};

export type OverviewPresentation = Record<OverviewMeasureKey, PresentedMeasure>;

const measure = (value: MetricValue | null) => formatMeasure(typeof value === "bigint" ? null : value);
const multiple = (value: MetricValue | null) => formatMultiple(typeof value === "number" ? value : null);
const count = (value: MetricValue | null) =>
  formatCount(typeof value === "bigint" || typeof value === "number" ? value : null);

/** `measures` is null when the period has no rows. `currency` is the store's reporting currency (ReportContext.currency). */
export function presentOverviewMeasures(
  measures: OverviewMeasures | null,
  currency: string | null,
): OverviewPresentation {
  const money = (value: MetricValue | null) => formatMoney(typeof value === "bigint" ? null : value, currency);
  const revenue = decimalToNumber(measures?.netRevenue ?? null);
  const orders = measures?.orders ?? null;
  const spend = decimalToNumber(measures?.adSpend ?? null);
  const sessions = measures?.sessions ?? null;
  const average = ratio(revenue, orders);
  const mer = ratio(revenue, spend);
  return {
    revenue: {
      display: formatMetricValue(
        measures?.netRevenue ?? null,
        "currency",
        overviewBindings[0].canonical.value_format,
        currency,
      ),
      sort: revenue,
      amount: measures?.netRevenue ?? null,
      format: money,
      better: "higher",
      additive: true,
    },
    orders: {
      display: formatMetricValue(orders, "count", overviewBindings[1].canonical.value_format, currency),
      sort: orders,
      amount: orders,
      format: measure,
      better: "higher",
      additive: true,
    },
    average: {
      display: formatMoney(average, currency),
      sort: average,
      amount: average,
      format: money,
      better: "higher",
      additive: false,
    },
    spend: {
      display: formatMoney(measures?.adSpend ?? null, currency),
      sort: spend,
      amount: measures?.adSpend ?? null,
      format: money,
      better: "neutral",
      additive: true,
    },
    mer: {
      display: formatMultiple(mer),
      sort: mer,
      amount: mer,
      format: multiple,
      better: "higher",
      additive: false,
    },
    sessions: {
      display: formatCount(sessions),
      sort: sessions === null ? null : toChartNumber(sessions),
      amount: sessions,
      format: count,
      better: "higher",
      additive: true,
    },
  };
}
