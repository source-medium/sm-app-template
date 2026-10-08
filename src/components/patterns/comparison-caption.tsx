import { COMPARISON_OPTIONS, type Comparison } from "@/lib/comparison";
import { formatDate } from "@/lib/format";

/**
 * One sentence naming the comparison period, worded the same on every view.
 * Children (coverage notes) turn it into a disclosure.
 */
export function ComparisonCaption({ comparison, children }: { comparison: Comparison; children?: React.ReactNode }) {
  if (!comparison.range) return null;
  const mode = COMPARISON_OPTIONS.find((option) => option.value === comparison.mode)?.label.toLowerCase();
  const text = `Compared with ${formatDate(comparison.range.from)} – ${formatDate(comparison.range.to)}${mode ? ` (${mode})` : ""}`;
  if (!children) return <p className="text-sm text-muted-foreground">{text}</p>;
  return (
    <details aria-label="Comparison period" className="text-sm text-muted-foreground">
      <summary className="w-fit cursor-pointer font-medium text-foreground">{text}</summary>
      {children}
    </details>
  );
}
