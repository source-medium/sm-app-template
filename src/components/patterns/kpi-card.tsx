/**
 * A headline number. The value arrives formatted from the server. Show a
 * delta row only when its comparison is real, with its dates explained by the
 * report; a card can carry one row per comparison slot.
 */
import { Card, CardContent } from "@/components/ui/card";
import type { MetricBinding } from "@/lib/metric-binding";
import { MetricDefinition, type MetricScope } from "@/components/patterns/metric-definition";
import { cn } from "@/lib/utils";
import { KpiTrend, type KpiTrendData } from "@/components/charts/kpi-trend";

export type KpiDelta = {
  /** The full change: amount and percentage, or why there is none. */
  display: string;
  /** The card's at-a-glance form; `display` stays in the card's details. */
  short?: string;
  direction: "up" | "down" | "flat" | null;
  good: boolean | null;
  comparedTo: string;
  /** Which comparison this row is: "vs previous 28 days". */
  label: string;
  /** The row explains why there is no change instead of showing one. */
  unavailable?: boolean;
};

export function KpiCard({
  label,
  value,
  fullValue,
  period,
  deltas = [],
  description,
  trend,
  binding,
  scope,
}: {
  binding?: MetricBinding;
  scope?: MetricScope;
  label: string;
  value: string;
  fullValue?: string;
  /** Only what the page's filters do not already say, such as why a value does not apply. */
  period?: string;
  /** One comparison row per slot, from slotDeltas(). */
  deltas?: KpiDelta[];
  /** A short, query-specific definition. Native details works with touch, keyboard, and no JavaScript. */
  description?: string;
  /** Optional selected-period daily values, with calendar gaps preserved by the caller. */
  trend?: KpiTrendData;
}) {
  const compared = deltas.filter((row) => !row.unavailable && row.comparedTo);
  // Every comparison hidden for one reason reads once; the report's comparison caption says why.
  const first = deltas[0];
  const rows =
    first && deltas.length > 1 && deltas.every((row) => row.unavailable && row.display === first.display)
      ? [{ ...first, label: "" }]
      : deltas;
  return (
    <Card data-agent-target={label} data-agent-component="KpiCard" className="gap-2 py-5">
      <CardContent className="flex flex-col gap-1 px-5">
        {description || binding || compared.length > 0 ? (
          <details className="text-sm text-muted-foreground">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              {/* The dotted underline is the cue that the label opens its definition. */}
              <span
                data-slot="kpi-label"
                className="underline decoration-muted-foreground/50 decoration-dotted underline-offset-4"
              >
                {label}
              </span>
              <span className="sr-only">definition. About this number</span>
            </summary>
            {binding && (
              <div className="py-3">
                <MetricDefinition binding={binding} scope={scope} />
              </div>
            )}
            {description && (
              <p data-metric-definition={label} className="pt-1 pb-2 text-xs leading-relaxed">
                {description}
              </p>
            )}
            {compared.length > 0 && (
              <ul className="flex flex-col gap-1 pt-1 pb-2 text-xs">
                {compared.map((row) => (
                  <li key={row.label}>
                    {row.display} {row.label}: {row.comparedTo}
                  </li>
                ))}
              </ul>
            )}
          </details>
        ) : (
          <span data-slot="kpi-label" className="text-sm text-muted-foreground">
            {label}
          </span>
        )}
        <span title={fullValue} data-slot="kpi-value" className="text-3xl font-semibold tracking-tight tabular-nums">
          <span aria-hidden={fullValue && fullValue !== value ? true : undefined}>{value}</span>
          {fullValue && fullValue !== value && <span className="sr-only">{fullValue}</span>}
        </span>
        {period && <span className="text-xs text-muted-foreground">{period}</span>}
        {rows.length > 0 && (
          <ul data-slot="kpi-comparison" className="mt-1 flex flex-col gap-0.5 text-xs">
            {/* The signed change and its color carry the direction, so no arrow sits beside it. */}
            {rows.map((row) => (
              <li key={row.label} className="flex flex-wrap items-center gap-x-1.5" data-slot="kpi-delta">
                <span
                  className={cn(
                    "font-medium",
                    row.unavailable || row.good === null
                      ? "text-muted-foreground"
                      : row.good
                        ? "text-success"
                        : "text-destructive",
                    row.unavailable && "font-normal",
                  )}
                >
                  {row.short ?? row.display}
                </span>
                <span className="text-muted-foreground">{row.label}</span>
              </li>
            ))}
          </ul>
        )}
        {trend && <KpiTrend label={label} {...trend} />}
      </CardContent>
    </Card>
  );
}
