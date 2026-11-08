import type { KpiDelta } from "./kpi-card";

function sentence(metric: string, value: string, change: KpiDelta | undefined, baseline?: string): string {
  if (!change) return `${metric}: ${value}.`;
  const against = baseline ? `against the ${baseline}` : change.label;
  if (change.direction === "flat") return `${metric} held at ${value} ${against}.`;
  if (change.direction === null || !change.short) return `${metric}: ${value}. ${change.display} ${change.label}.`;
  return `${metric} ${change.direction === "up" ? "rose" : "fell"} ${change.short.replace(/^[+-]/, "")} to ${value} ${against}.`;
}

/**
 * A scoped observation from the same formatted values and coverage rules as
 * the report's KPIs. `baseline` is the comparison's own name ("previous 28
 * days", the plan slot's label); without it the sentence uses the row's label.
 */
export function ReportTakeaway({
  metric,
  value,
  change,
  baseline,
}: {
  metric: string;
  value: string;
  change?: KpiDelta;
  baseline?: string;
}) {
  // An unavailable comparison has no observation to make; the comparison caption says why, once.
  if (change?.unavailable) return null;
  return (
    <p
      aria-label="Report takeaway"
      className="max-w-prose font-display text-lg leading-snug text-balance wrap-anywhere sm:text-xl"
    >
      {sentence(metric, value, change, baseline)}
    </p>
  );
}
