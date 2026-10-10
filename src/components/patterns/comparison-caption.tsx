import { COMPARISON_OPTIONS, type Comparison } from "@/lib/comparison";
import { formatDate } from "@/lib/format";

/**
 * One sentence naming the comparison period, worded the same on every view.
 * Children (coverage notes) turn it into a disclosure. `issue` is
 * coverageIssue()'s reason changes are hidden, shown outside the disclosure.
 */
export function ComparisonCaption({
  comparison,
  issue,
  children,
}: {
  comparison: Comparison;
  issue?: string | null;
  children?: React.ReactNode;
}) {
  if (!comparison.range) return null;
  const mode = COMPARISON_OPTIONS.find((option) => option.value === comparison.mode)?.label.toLowerCase();
  const text = `Compared with ${formatDate(comparison.range.from)} – ${formatDate(comparison.range.to)}${mode ? ` (${mode})` : ""}`;
  return (
    <div className="flex flex-col gap-1">
      {children ? (
        <details aria-label="Comparison period" className="text-sm text-muted-foreground">
          <summary className="w-fit cursor-pointer font-medium text-foreground">{text}</summary>
          {children}
        </details>
      ) : (
        <p className="text-sm text-muted-foreground">{text}</p>
      )}
      <ComparisonIssue issue={issue} />
    </div>
  );
}

/** Why period changes are hidden, for views that learn it only after their data loads. */
export function ComparisonIssue({ issue }: { issue?: string | null }) {
  return issue ? (
    <p data-comparison-issue className="max-w-prose text-sm">
      {issue}
    </p>
  ) : null;
}
