/** Server-side presentation for a KPI comparison; metric meaning stays with its feature. */
import "server-only";
import { compareValues, type MetricValue } from "@/lib/comparison";
import { formatChangePercent } from "@/lib/format";
import type { KpiDelta } from "./kpi-card";

export function kpiDelta<T extends MetricValue>(
  current: T | null,
  baseline: T | null,
  format: (value: T | null) => string,
  better: "higher" | "lower" | "neutral" = "neutral",
): KpiDelta {
  const change = compareValues(current, baseline);
  const good =
    better === "neutral" || change.direction === null || change.direction === "flat"
      ? null
      : (change.direction === "up") === (better === "higher");
  let display = baseline === null ? "No comparison value" : "No current value";
  if (change.difference !== null) {
    const amount = `${change.direction === "up" ? "+" : ""}${format(change.difference)}`;
    const relative =
      change.percent !== null
        ? formatChangePercent(change.percent)
        : change.reason === "zero"
          ? "zero baseline"
          : change.reason === "negative"
            ? "negative baseline"
            : "percentage unavailable";
    display = change.direction === "flat" ? "No change" : `${amount} (${relative})`;
  }
  return { display, direction: change.direction, good, comparedTo: format(baseline) };
}
