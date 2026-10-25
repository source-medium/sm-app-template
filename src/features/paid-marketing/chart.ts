/**
 * The ad platform chart's series. The seven largest platforms by impressions
 * are named and colored in source_system order, so a filter never repaints
 * them; the rest fold into Other. A selected platform always gets its own
 * series, even when it is too small to be named. Series show platform names.
 */
import type { ChartSeries } from "@/components/charts/chart-card";
import { adPlatformLabel } from "@/lib/ad-platforms";
import { decimalToNumber, ratio, sumDecimals } from "@/lib/data/decimal";
import { periodStart, type TimeGrain } from "@/lib/time-grain";
import type { AdMeasures, ChannelDay, PaidMetric } from "./queries";

export const MAX_NAMED_CHANNELS = 7;

export type MetricValue = string | bigint | number | null;

export type ChannelChart = {
  series: ChartSeries[];
  /** Per date, each series key's summed inputs; `metricValue` derives any measure from them. */
  byDate: Map<string, Map<string, AdMeasures>>;
  /** Every channel, in name order, for the channel picker. */
  channels: string[];
  /** True when some channels are combined as Other. */
  folded: boolean;
};

export function channelChart(
  days: readonly ChannelDay[],
  selected: string | null,
  grain: TimeGrain = "day",
): ChannelChart {
  const impressions = new Map<string, bigint>();
  for (const day of days) impressions.set(day.channel, (impressions.get(day.channel) ?? 0n) + (day.impressions ?? 0n));
  const channels = [...impressions.keys()].sort((a, b) => a.localeCompare(b));
  const named = [...impressions.entries()]
    .sort(([, a], [, b]) => (a === b ? 0 : a > b ? -1 : 1))
    .slice(0, MAX_NAMED_CHANNELS)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  const keyOf = (channel: string) => {
    const index = named.indexOf(channel);
    if (index >= 0) return `channel${index}`;
    return channel === selected ? "selected" : "other";
  };
  const colorOf = (channel: string) => {
    const index = named.indexOf(channel);
    return index >= 0 ? `var(--chart-${index + 1})` : "var(--chart-8)";
  };

  const folded = channels.length > named.length;
  const series: ChartSeries[] = selected
    ? [{ key: keyOf(selected), label: adPlatformLabel(selected), color: colorOf(selected) }]
    : named.map((name) => ({ key: keyOf(name), label: adPlatformLabel(name), color: colorOf(name) }));
  if (folded && !selected) series.push({ key: "other", label: "Other", color: "var(--chart-8)" });

  // Sum the inputs before dividing, including folded channels and calendar buckets.
  const grouped = new Map<string, Map<string, AdMeasures>>();
  const addCount = (a: bigint | null, b: bigint | null) => (a === null ? b : b === null ? a : a + b);
  const addNumber = (a: number | null, b: number | null) => (a === null ? b : b === null ? a : a + b);
  for (const day of days) {
    const date = periodStart(day.date, grain);
    const values = grouped.get(date) ?? new Map<string, AdMeasures>();
    const key = keyOf(day.channel);
    const previous = values.get(key);
    values.set(
      key,
      previous
        ? {
            spend: sumDecimals([previous.spend, day.spend]),
            impressions: addCount(previous.impressions, day.impressions),
            clicks: addCount(previous.clicks, day.clicks),
            conversions: addNumber(previous.conversions, day.conversions),
            platformRevenue: addNumber(previous.platformRevenue, day.platformRevenue),
          }
        : day,
    );
    grouped.set(date, values);
  }
  return { series, byDate: grouped, channels, folded };
}

/** Ratios divide the summed inputs, so they are never averages of daily ratios. */
export function metricValue(row: AdMeasures | undefined, metric: PaidMetric): MetricValue {
  if (!row) return null;
  if (metric === "roas") return ratio(row.platformRevenue, decimalToNumber(row.spend));
  if (metric === "cpo") return ratio(decimalToNumber(row.spend), row.conversions);
  if (metric === "revenue") return row.platformRevenue;
  return row[metric];
}
