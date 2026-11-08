/** Server-side presentation for a KPI comparison; metric meaning stays with its feature. */
import "server-only";
import {
  changeTone,
  compareValues,
  type Baseline,
  type ComparisonPlan,
  type MetricValue,
  type PeriodChanges,
  type Polarity,
} from "@/lib/comparison";
import { formatChangePercent, formatDateRange } from "@/lib/format";
import type { DataTableCell } from "./data-table";
import type { KpiDelta } from "./kpi-card";

/**
 * One change for a KPI card or a table cell. `better` comes from the measure's
 * own definition: it decides the color, so a rise in refunds never reads as
 * good. `label` names the baseline the row compares with ("vs previous 28
 * days"); slotDeltas() builds it from each plan slot.
 */
export function kpiDelta<T extends MetricValue>(
  current: T | null,
  baseline: T | null,
  format: (value: T | null) => string,
  better: Polarity,
  label = "vs comparison",
): KpiDelta {
  const change = compareValues(current, baseline);
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
  return {
    display,
    // The percentage reads at a glance; a change with none keeps its amount.
    short: change.direction !== "flat" && change.percent !== null ? formatChangePercent(change.percent) : undefined,
    direction: change.direction,
    tone: changeTone(change.direction, better),
    comparedTo: format(baseline),
    label,
  };
}

/** A table's change cell: the full change, colored the same way as a KPI card. */
export function changeCell(delta: KpiDelta): DataTableCell {
  return { display: delta.display, tone: delta.tone ?? undefined };
}

/** How a KPI row names its baseline: "vs previous 28 days", "vs last year". */
function baselineLabel(slot: Baseline): string {
  return `vs ${slot.short}`;
}

/** A row that explains why a slot has no change, in place of a delta. */
function unavailableDelta(slot: Baseline, reason?: string | null): KpiDelta {
  return {
    display: reason ?? slot.note ?? "Unavailable",
    direction: null,
    tone: null,
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
    // A second slot that repeats the first adds no row; the comparison caption says why.
    if (baseline.mode === "off" || baseline.repeatsFirst) return [];
    const slot = index as 0 | 1;
    const coverage = changes?.[slot];
    const row = coverage?.show ? change(baselineLabel(baseline), slot) : null;
    return [row ?? unavailableDelta(baseline, unavailable?.(slot) ?? (coverage?.issue ? "Changes hidden" : undefined))];
  });
}
