/**
 * A headline number. The value arrives formatted from the server. Show a
 * delta only when the comparison is real (a named, equal-length period).
 */
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export type KpiDelta = { display: string; direction: "up" | "down"; good: boolean; comparedTo: string };

export function KpiCard({
  label,
  value,
  period,
  delta,
}: {
  label: string;
  value: string;
  period: string;
  delta?: KpiDelta;
}) {
  const Arrow = delta?.direction === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <Card className="gap-2 py-5 shadow-card">
      <CardContent className="flex flex-col gap-1 px-5">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-3xl font-semibold tracking-tight">{value}</span>
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
