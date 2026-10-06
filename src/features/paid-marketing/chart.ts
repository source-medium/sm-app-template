/**
 * The channel chart's series. The seven largest channels by impressions are
 * named and colored in name order, so a filter never repaints them; the rest
 * fold into Other. A selected channel always gets its own series, even when
 * it is too small to be named.
 */
import type { ChartSeries } from "@/components/charts/chart-card";
import { sumDecimals } from "@/lib/data/decimal";
import type { ChannelDay, PaidMetric } from "./queries";

export const MAX_NAMED_CHANNELS = 7;

export type MetricValue = string | bigint | number | null;

export type ChannelChart = {
  series: ChartSeries[];
  /** Per date, each series key's value of the chosen metric. */
  byDate: Map<string, Record<string, MetricValue>>;
  /** Every channel, in name order, for the channel picker. */
  channels: string[];
  /** True when some channels are combined as Other. */
  folded: boolean;
};

/** Sums one metric exactly: decimal text for money, bigint for counts, numbers for conversions. */
function addValues(a: MetricValue, b: MetricValue): MetricValue {
  if (a === null) return b;
  if (b === null) return a;
  if (typeof a === "string" && typeof b === "string") return sumDecimals([a, b]);
  if (typeof a === "bigint" && typeof b === "bigint") return a + b;
  return Number(a) + Number(b);
}

export function channelChart(days: readonly ChannelDay[], metric: PaidMetric, selected: string | null): ChannelChart {
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
    ? [{ key: keyOf(selected), label: selected, color: colorOf(selected) }]
    : named.map((name) => ({ key: keyOf(name), label: name, color: colorOf(name) }));
  if (folded && !selected) series.push({ key: "other", label: "Other", color: "var(--chart-8)" });

  const byDate = new Map<string, Record<string, MetricValue>>();
  for (const day of days) {
    const values = byDate.get(day.date) ?? {};
    const key = keyOf(day.channel);
    values[key] = addValues(values[key] ?? null, day[metric]);
    byDate.set(day.date, values);
  }
  return { series, byDate, channels, folded };
}
