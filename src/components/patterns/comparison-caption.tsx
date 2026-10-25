import { dayCount, type Baseline, type ComparisonPlan } from "@/lib/comparison";
import { rangeLength } from "@/lib/filters";
import { formatDateRange } from "@/lib/format";
import { Disclosure } from "@/components/ui/disclosure";
import { BaselineSwitch } from "./baseline-switch";

/** "Aug 29, 2026 – Sep 25, 2026 (previous 28 days, 28 days)" or why the slot has no dates. */
function describe(slot: Baseline): string {
  if (slot.mode === "off") return "";
  if (!slot.range) return `${slot.label}: ${slot.note ?? "unavailable"}`;
  const days = rangeLength(slot.range);
  return `${formatDateRange(slot.range)} (${slot.label}, ${dayCount(days)}${slot.alignment === "calendar" ? ", calendar dates" : ""})`;
}

/**
 * One sentence naming the comparison periods, worded the same on every view.
 * Children (coverage notes) turn it into a disclosure. `issues` are each
 * slot's coverageIssue() reason changes are hidden, shown outside the disclosure.
 * `switchable` offers the switch between slots; turn it off when nothing on the
 * view has a per-slot variant.
 */
export function ComparisonCaption({
  plan,
  issues = [],
  switchable = true,
  children,
}: {
  plan: ComparisonPlan;
  issues?: (string | null | undefined)[];
  switchable?: boolean;
  children?: React.ReactNode;
}) {
  const described = plan.slots.map(describe).filter(Boolean);
  if (!described.length) return null;
  const text = `Compared with ${described.join(" and ")}. ${dayCount(rangeLength(plan.range))} selected.`;
  return (
    <div className="flex flex-col gap-1" data-slot="comparison-caption">
      {children ? (
        <Disclosure aria-label="Comparison periods" summary={text} className="text-sm text-muted-foreground">
          {children}
        </Disclosure>
      ) : (
        <p className="text-sm text-muted-foreground">{text}</p>
      )}
      {issues.map((issue, index) =>
        issue ? <ComparisonIssue key={index} issue={`${plan.slots[index]?.label ?? "Comparison"}: ${issue}`} /> : null,
      )}
      {switchable && (
        <BaselineSwitch
          labels={[switchLabel(plan.slots[0]), switchLabel(plan.slots[1])]}
          available={[plan.slots[0].range !== null, plan.slots[1].range !== null]}
        />
      )}
    </div>
  );
}

function switchLabel(slot: Baseline): string {
  return slot.label.charAt(0).toUpperCase() + slot.label.slice(1);
}

/** Why period changes are hidden, for views that learn it only after their data loads. */
function ComparisonIssue({ issue }: { issue?: string | null }) {
  return issue ? (
    <p data-comparison-issue className="max-w-prose text-sm">
      {issue}
    </p>
  ) : null;
}
