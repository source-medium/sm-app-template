import "server-only";
import { buildChartData } from "@/components/charts/chart-data";
import { comparisonDates, type Comparison } from "@/lib/comparison";
import { decimalToNumber, sumDecimals } from "@/lib/data/decimal";
import { toChartNumber } from "@/lib/data/decode";
import { datesInRange, type DateRange } from "@/lib/filters";
import { formatDate, formatDay } from "@/lib/format";
import { OVERVIEW_MEASURE_KEYS, presentOverviewMeasures, type OverviewMeasureKey } from "./measures";
import { overviewBindings } from "./metrics";
import type { OverviewDay, OverviewMeasures } from "./queries";

export const TREND_MODES = [
  { value: "daily", label: "Daily values" },
  { value: "cumulative", label: "Cumulative values" },
] as const;
export type TrendMode = (typeof TREND_MODES)[number]["value"];

/** The stored measures each trend reads. A missing input is a gap; a zero denominator is only an undefined ratio. */
const TREND_INPUTS: Record<OverviewMeasureKey, readonly (keyof OverviewMeasures)[]> = {
  revenue: ["netRevenue"],
  orders: ["orders"],
  average: ["netRevenue", "orders"],
  spend: ["adSpend"],
  mer: ["netRevenue", "adSpend"],
  sessions: ["sessions"],
};

/** A missing date or measure makes its cumulative total unknown from that point on. */
export function trendDays(days: OverviewDay[], range: DateRange, mode: TrendMode): Map<string, OverviewDay> {
  const byDate = new Map(days.map((day) => [day.date, day]));
  let revenue: string | null = "0";
  let orders: number | null = 0;
  let spend: string | null = "0";
  let sessions: bigint | null = 0n;
  return new Map(
    datesInRange(range).map((date) => {
      const day = byDate.get(date);
      if (mode === "daily")
        return [
          date,
          {
            date,
            netRevenue: day?.netRevenue ?? null,
            orders: day?.orders ?? null,
            adSpend: day?.adSpend ?? null,
            sessions: day?.sessions ?? null,
          },
        ];
      revenue = revenue === null || day?.netRevenue == null ? null : sumDecimals([revenue, day.netRevenue]);
      orders = orders === null || day?.orders == null ? null : orders + day.orders;
      spend = spend === null || day?.adSpend == null ? null : sumDecimals([spend, day.adSpend]);
      sessions = sessions === null || day?.sessions == null ? null : sessions + day.sessions;
      return [date, { date, netRevenue: revenue, orders, adSpend: spend, sessions }];
    }),
  );
}

/**
 * One chart per KPI measure, formatted like the KPI cards. Ratios divide the
 * day's (or the running) totals. Each period accumulates on its own calendar
 * before comparison dates are aligned.
 */
export function overviewTrends(
  days: OverviewDay[],
  range: DateRange,
  mode: TrendMode,
  currency: string | null,
  comparison?: { period: Comparison; days: OverviewDay[] },
) {
  const current = trendDays(days, range, mode);
  const baseline = comparison?.period.range;
  const prior = baseline && comparison ? trendDays(comparison.days, baseline, mode) : new Map<string, OverviewDay>();
  const aligned = comparison ? comparisonDates(range, comparison.period) : [];
  const rows = [...current.values()].map((day, index) => {
    const priorDate = aligned[index];
    const previous = priorDate ? prior.get(priorDate) : undefined;
    return {
      day,
      presented: presentOverviewMeasures(day, currency),
      priorDate,
      previous,
      previousPresented: previous ? presentOverviewMeasures(previous, currency) : null,
    };
  });
  return OVERVIEW_MEASURE_KEYS.map((key) => {
    const point = (row: OverviewDay | undefined, presented: ReturnType<typeof presentOverviewMeasures> | null) => {
      const amount = presented?.[key].amount ?? null;
      const missing = !row || !presented || TREND_INPUTS[key].some((field) => row[field] === null);
      return {
        value: typeof amount === "string" ? decimalToNumber(amount) : amount,
        display: missing
          ? mode === "cumulative"
            ? "Incomplete cumulative data"
            : "No data"
          : (presented?.[key].display ?? ""),
      };
    };
    return {
      key,
      label: overviewBindings.find((binding) => binding.id === key)?.label ?? key,
      ...buildChartData(
        rows.map(({ day, presented, priorDate, previous, previousPresented }) => {
          const previousPoint = point(previous, previousPresented);
          return {
            label: formatDay(day.date),
            values: {
              [key]: point(day, presented),
              ...(baseline
                ? {
                    [`previous_${key}`]: {
                      ...previousPoint,
                      display: priorDate
                        ? `${previousPoint.display} (${formatDate(priorDate)})`
                        : "No matching calendar day",
                    },
                  }
                : {}),
            },
          };
        }),
      ),
    };
  });
}

/** Up to eight weeks a sparkline shows each day; longer periods show weeks, so the line reads as a trend rather than weekday noise. */
export const SPARKLINE_DAILY_DAYS = 56;

/**
 * A KPI sparkline's points for one measure, from days lined up with the
 * selected dates (undefined where a date has no rows). Long periods group
 * seven dates per point, counted back from the last date: a measure that adds
 * up shows its daily average over the dates with rows, so a short oldest week
 * does not dip, and a ratio divides the week's totals. A point with no rows, or a missing input, is a gap.
 */
export function sparklineValues(
  days: readonly (OverviewDay | undefined)[],
  key: OverviewMeasureKey,
  currency: string | null,
): (number | bigint | null)[] {
  const size = days.length > SPARKLINE_DAILY_DAYS ? 7 : 1;
  const points: (number | bigint | null)[] = [];
  // Weeks count back from the last date, so the newest point is a whole week and any short one is the oldest.
  for (let end = days.length; end > 0; end -= size) {
    const present = days.slice(Math.max(0, end - size), end).filter((day): day is OverviewDay => day !== undefined);
    if (!present.length) {
      points.unshift(null);
      continue;
    }
    // A day with rows but a missing input leaves the whole point unknown, never a smaller total.
    const missing = (field: keyof OverviewMeasures) => present.some((day) => day[field] === null);
    const totals: OverviewMeasures = {
      netRevenue: missing("netRevenue") ? null : sumDecimals(present.map((day) => day.netRevenue)),
      orders: missing("orders") ? null : present.reduce((sum, day) => sum + (day.orders ?? 0), 0),
      adSpend: missing("adSpend") ? null : sumDecimals(present.map((day) => day.adSpend)),
      sessions: missing("sessions") ? null : present.reduce((sum, day) => sum + (day.sessions ?? 0n), 0n),
    };
    const measure = presentOverviewMeasures(totals, currency)[key];
    const amount = measure.amount;
    if (size === 1 || !measure.additive || amount === null) {
      points.unshift(typeof amount === "string" ? decimalToNumber(amount) : amount);
      continue;
    }
    const total = typeof amount === "string" ? decimalToNumber(amount) : toChartNumber(amount);
    points.unshift(total === null ? null : total / present.length);
  }
  return points;
}
