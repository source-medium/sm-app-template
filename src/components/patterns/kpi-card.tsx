/**
 * A headline number. The value arrives formatted from the server. Show a
 * delta only when the comparison is real (a named, equal-length period).
 */
import { ArrowDownRight, ArrowUpRight, Info } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiDelta = { display: string; direction: "up" | "down"; good: boolean; comparedTo: string };

export function KpiCard({
  label,
  value,
  period,
  delta,
  description,
}: {
  label: string;
  value: string;
  period: string;
  delta?: KpiDelta;
  /** A short, query-specific definition. Native details works with touch, keyboard, and no JavaScript. */
  description?: string;
}) {
  const Arrow = delta?.direction === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <Card className="gap-2 py-5">
      <CardContent className="flex flex-col gap-1 px-5">
        {description ? (
          <details className="text-sm text-muted-foreground">
            <summary className="flex min-h-6 cursor-pointer list-none items-center gap-1.5 rounded-sm transition-colors hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring pointer-coarse:min-h-11 [&::-webkit-details-marker]:hidden">
              <span>{label}</span>
              <Info className="size-3.5 shrink-0" aria-hidden />
              <span className="sr-only">definition</span>
            </summary>
            <p className="pt-1 pb-2 text-xs leading-relaxed">{description}</p>
          </details>
        ) : (
          <span className="text-sm text-muted-foreground">{label}</span>
        )}
        <span className="text-3xl font-semibold tracking-tight tabular-nums">{value}</span>
        <span className="text-xs text-muted-foreground">{period}</span>
        {delta && (
          <span
            className={cn(
              "flex items-center gap-1 text-xs font-medium",
              delta.good ? "text-success" : "text-destructive",
            )}
          >
            <Arrow className="size-3.5" aria-hidden />
            {delta.display} vs {delta.comparedTo}
          </span>
        )}
      </CardContent>
    </Card>
  );
}
