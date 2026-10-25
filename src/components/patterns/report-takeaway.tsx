import { formatDateRange } from "@/lib/format";
import type { DateRange } from "@/lib/filters";
import type { KpiDelta } from "./kpi-card";

/** A scoped observation from the same formatted values and coverage rules as the report's KPIs. */
export function ReportTakeaway({
  metric,
  value,
  range,
  change,
  issue,
}: {
  metric: string;
  value: string;
  range: DateRange;
  change?: KpiDelta;
  issue?: string | null;
}) {
  return (
    <p aria-label="Report takeaway" className="max-w-prose text-sm leading-relaxed wrap-anywhere">
      <span className="font-medium">
        {metric}: {value}
      </span>{" "}
      for {formatDateRange(range)}.
      {change &&
        (change.unavailable
          ? ` Comparison unavailable ${change.label}: ${issue ?? change.display}.`
          : ` ${change.display} ${change.label}.`)}
    </p>
  );
}
