import "server-only";
import { buildChartData } from "@/components/charts/chart-data";
import { comparisonDates, type Comparison } from "@/lib/comparison";
import { decimalToNumber, sumDecimals } from "@/lib/data/decimal";
import { datesInRange, type DateRange } from "@/lib/filters";
import { formatDate, formatDay, formatMeasure, formatMoney } from "@/lib/format";
import type { OverviewDay } from "./queries";

export const TREND_MODES = [
  { value: "daily", label: "Daily values" },
  { value: "cumulative", label: "Cumulative values" },
] as const;
export type TrendMode = (typeof TREND_MODES)[number]["value"];
type TrendDay = Pick<OverviewDay, "date" | "netRevenue" | "orders" | "adSpend">;

/** A missing date or measure makes its cumulative total unknown from that point on. */
export function trendDays(days: OverviewDay[], range: DateRange, mode: TrendMode): Map<string, TrendDay> {
  const byDate = new Map(days.map((day) => [day.date, day]));
  let revenue: string | null = "0";
  let orders: number | null = 0;
  let spend: string | null = "0";
  return new Map(
    datesInRange(range).map((date) => {
      const day = byDate.get(date);
      if (mode === "daily")
        return [
          date,
          { date, netRevenue: day?.netRevenue ?? null, orders: day?.orders ?? null, adSpend: day?.adSpend ?? null },
        ];
      revenue = revenue === null || day?.netRevenue == null ? null : sumDecimals([revenue, day.netRevenue]);
      orders = orders === null || day?.orders == null ? null : orders + day.orders;
      spend = spend === null || day?.adSpend == null ? null : sumDecimals([spend, day.adSpend]);
      return [date, { date, netRevenue: revenue, orders, adSpend: spend }];
    }),
  );
}

/** Each period accumulates on its own calendar before comparison dates are aligned. */
export function overviewTrends(
  days: OverviewDay[],
  range: DateRange,
  mode: TrendMode,
  currency: string | null,
  comparison?: { period: Comparison; days: OverviewDay[] },
) {
  const current = trendDays(days, range, mode);
  const baseline = comparison?.period.range;
  const prior = baseline && comparison ? trendDays(comparison.days, baseline, mode) : new Map<string, TrendDay>();
  const aligned = comparison ? comparisonDates(range, comparison.period) : [];
  const measures = [
    {
      key: "revenue",
      field: "netRevenue",
      label: "Net revenue",
      format: (value: string | number | null) => formatMoney(value, currency),
    },
    {
      key: "orders",
      field: "orders",
      label: "Summary orders",
      format: (value: string | number | null) => formatMeasure(typeof value === "number" ? value : null),
    },
    {
      key: "spend",
      field: "adSpend",
      label: "Ad spend",
      format: (value: string | number | null) => formatMoney(value, currency),
    },
  ] as const;
  return measures.map((measure) => ({
    key: measure.key,
    label: measure.label,
    title: mode === "cumulative" ? `Cumulative ${measure.label.toLowerCase()}` : `${measure.label} by day`,
    ...buildChartData(
      [...current.values()].map((day, index) => {
        const priorDate = aligned[index];
        const previous = priorDate ? prior.get(priorDate) : undefined;
        const point = (row: TrendDay | undefined) => {
          const amount = row?.[measure.field] ?? null;
          return {
            value: typeof amount === "string" ? decimalToNumber(amount) : amount,
            display:
              amount === null
                ? mode === "cumulative"
                  ? "Incomplete cumulative data"
                  : "No data"
                : measure.format(amount),
          };
        };
        const previousPoint = point(previous);
        return {
          label: formatDay(day.date),
          values: {
            [measure.key]: point(day),
            ...(baseline
              ? {
                  [`previous_${measure.key}`]: {
                    ...previousPoint,
                    display: `${priorDate ? previousPoint.display : "No matching calendar day"}${priorDate ? ` (${formatDate(priorDate)})` : ""}`,
                  },
                }
              : {}),
          },
        };
      }),
    ),
  }));
}
