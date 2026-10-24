/** Server-side presentation for a KPI comparison; metric meaning stays with its feature. */
import "server-only";
import {
  compareValues,
  type Baseline,
  type ComparisonPlan,
  type MetricValue,
  type PeriodChanges,
} from "@/lib/comparison";
import { formatChangePercent, formatDateRange } from "@/lib/format";
import type { KpiDelta } from "./kpi-card";

/**
 * One change row for a KPI card. `label` names the baseline the row compares
 * with ("vs previous 28 days"); `baselineLabel()` builds it from a plan slot.
 */
export function kpiDelta<T extends MetricValue>(
  current: T | null,
  baseline: T | null,
  format: (value: T | null) => string,
  better: "higher" | "lower" | "neutral" = "neutral",
  label = "vs comparison",
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
  return { display, direction: change.direction, good, comparedTo: format(baseline), label };
}

/** How a KPI row names its baseline: "vs previous 28 days". */
export function baselineLabel(slot: Baseline): string {
  return `vs ${slot.label}`;
}

/** A row that explains why a slot has no change, in place of a delta. */
export function unavailableDelta(slot: Baseline, reason?: string | null): KpiDelta {
  return {
    display: reason ?? slot.note ?? "Unavailable",
    direction: null,
    good: null,
    comparedTo: slot.range ? formatDateRange(slot.range) : "",
    label: baselineLabel(slot),
    unavailable: true,
  };
}

/**
 * One KPI row per comparison slot that is on, in slot order. `change` builds a
 * slot's row where its coverage allows changes, or returns null when the view
 * has no comparable value; otherwise the row says why, preferring
 * `unavailable(slot)` (a failed query) over hidden changes.
 */
export function slotDeltas(
  plan: ComparisonPlan | undefined,
  changes: readonly PeriodChanges[] | null | undefined,
  change: (label: string, slot: 0 | 1) => KpiDelta | null,
  unavailable?: (slot: 0 | 1) => string | undefined,
): KpiDelta[] {
  if (!plan) return [];
  return plan.slots.flatMap((baseline, index) => {
    if (baseline.mode === "off") return [];
    const slot = index as 0 | 1;
    const coverage = changes?.[slot];
    const row = coverage?.show ? change(baselineLabel(baseline), slot) : null;
    return [row ?? unavailableDelta(baseline, unavailable?.(slot) ?? (coverage?.issue ? "Changes hidden" : undefined))];
  });
}
