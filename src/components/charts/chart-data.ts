/**
 * Builds chart rows on the server: the numeric value Recharts plots and the
 * formatted string the tooltip and table show. A value that cannot be
 * represented exactly is left out of the plot and the card falls back to
 * its table.
 */
import "server-only";
import { toChartNumber } from "@/lib/data/decode";
import type { ChartDatum } from "./chart-card";

export type PointValue = { value: bigint | number | null; display: string };

export function buildChartData(points: { label: string; values: Record<string, PointValue> }[]): {
  data: ChartDatum[];
  plottable: boolean;
} {
  let plottable = true;
  const data = points.map(({ label, values }) => {
    const datum: ChartDatum = { label };
    for (const [key, { value, display }] of Object.entries(values)) {
      const numeric = value === null ? null : toChartNumber(value);
      if (value !== null && numeric === null) plottable = false;
      datum[key] = numeric;
      datum[`${key}__display`] = display;
    }
    return datum;
  });
  return { data, plottable };
}
