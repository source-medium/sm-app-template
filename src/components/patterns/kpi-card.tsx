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
import type { ChangeTone } from "@/lib/comparison";
import { CHANGE_TONE_CLASS } from "./change-tone";

export type KpiDelta = {
  /** The full change: amount and percentage, or why there is none. */
  display: string;
  /** The card's at-a-glance form; `display` stays in the card's details. */
  short?: string;
  direction: "up" | "down" | "flat" | null;
  /** Good or bad for this measure, from its declared polarity; null when neither. */
  tone: ChangeTone | null;
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
  children,
  compact = false,
}: {
  children?: React.ReactNode;
  compact?: boolean;
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
    <Card
      data-agent-target={label}
      data-agent-component="KpiCard"
      className={cn(
        "@container/kpi gap-2 pt-3 pb-5",
        children && "grid gap-y-1 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,18rem),1fr))] sm:items-center",
        compact && "gap-0 rounded-none border-0 py-2 shadow-none sm:py-3",
      )}
    >
      <CardContent
        className={cn(
          "flex flex-col gap-1 px-5",
          compact && "max-sm:grid max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-center max-sm:gap-y-0",
        )}
      >
        {description || binding || compared.length > 0 ? (
          <details className={cn("text-sm text-muted-foreground", compact && "open:col-span-full")}>
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
        <span
          title={fullValue}
          data-slot="kpi-value"
          className={cn(
            "text-2xl font-semibold tracking-tight tabular-nums @[13rem]/kpi:text-3xl",
            compact && "max-w-full text-xl @[13rem]/kpi:text-2xl",
          )}
        >
          <span aria-hidden={fullValue && fullValue !== value ? true : undefined}>{value}</span>
          {fullValue && fullValue !== value && <span className="sr-only">{fullValue}</span>}
        </span>
        {period && <span className="text-xs text-muted-foreground">{period}</span>}
        {rows.length > 0 && (
          <ul
            data-slot="kpi-comparison"
            className={cn(
              "mt-1 flex flex-col text-xs",
              compact
                ? "col-span-full gap-0.5 max-sm:mt-0 max-sm:flex-row max-sm:flex-wrap max-sm:justify-end max-sm:gap-x-4"
                : "gap-1.5 @[13rem]/kpi:gap-0.5",
            )}
          >
            {/* The signed change and its color carry the direction, so no arrow sits beside it. */}
            {rows.map((row) => (
              <li
                key={row.label}
                // A narrow card stacks every change over its period, so rows read alike; the list's gap
                // keeps each change with its own period.
                className="flex flex-col @[13rem]/kpi:flex-row @[13rem]/kpi:flex-wrap @[13rem]/kpi:items-center @[13rem]/kpi:gap-x-1.5"
                data-slot="kpi-delta"
              >
                <span
                  className={cn(
                    "font-medium",
                    row.unavailable || !row.tone ? "text-muted-foreground" : CHANGE_TONE_CLASS[row.tone],
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
      {children}
    </Card>
  );
}
