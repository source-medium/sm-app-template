/**
 * A headline number. The value arrives formatted from the server. Show a
 * delta row only when its comparison is real, with its dates explained by the
 * report; a card can carry one row per comparison slot.
 */
import { ArrowDownRight, ArrowUpRight, Info, Minus } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import type { MetricBinding } from "@/lib/metric-binding";
import { MetricDefinition, type MetricScope } from "@/components/patterns/metric-definition";
import { cn } from "@/lib/utils";
import { KpiTrend, type KpiTrendData } from "@/components/charts/kpi-trend";

export type KpiDelta = {
  display: string;
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
  delta,
  deltas = delta ? [delta] : [],
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
  period: string;
  /** One comparison row; prefer `deltas` for a report with two comparison slots. */
  delta?: KpiDelta;
  deltas?: KpiDelta[];
  /** A short, query-specific definition. Native details works with touch, keyboard, and no JavaScript. */
  description?: string;
  /** Optional selected-period daily values, with calendar gaps preserved by the caller. */
  trend?: KpiTrendData;
}) {
  return (
    <Card data-agent-target={label} data-agent-component="KpiCard" className="gap-2 py-5">
      <CardContent className="flex flex-col gap-1 px-5">
        {description || binding ? (
          <details className="text-sm text-muted-foreground">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring [&::-webkit-details-marker]:hidden">
              <span data-slot="kpi-label">{label}</span>
              <Info className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">definition. About this number</span>
            </summary>
            {binding && (
              <div className="py-3">
                <MetricDefinition binding={binding} scope={scope} />
              </div>
            )}
            <p data-metric-definition={label} className="pt-1 pb-2 text-xs leading-relaxed">
              {description}
            </p>
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
        <span className="text-xs text-muted-foreground">{period}</span>
        {deltas.length > 0 && (
          <ul data-slot="kpi-comparison" className="mt-1 flex flex-col gap-1.5 text-xs">
            {deltas.map((row) => {
              const Arrow = row.direction === "flat" ? Minus : row.direction === "down" ? ArrowDownRight : ArrowUpRight;
              return (
                <li key={row.label} className="flex flex-col gap-0.5" data-slot="kpi-delta">
                  <span
                    className={cn(
                      "flex items-center gap-1 font-medium",
                      row.unavailable || row.good === null
                        ? "text-muted-foreground"
                        : row.good
                          ? "text-success"
                          : "text-destructive",
                      row.unavailable && "font-normal",
                    )}
                  >
                    {row.direction && <Arrow className="size-3.5 shrink-0" aria-hidden />}
                    <span className="min-w-0">{row.display}</span>
                  </span>
                  <span className="text-muted-foreground">
                    {row.label}
                    {row.comparedTo && (
                      <>
                        {": "}
                        <span>{row.comparedTo}</span>
                      </>
                    )}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        {trend && <KpiTrend label={label} {...trend} />}
      </CardContent>
    </Card>
  );
}
