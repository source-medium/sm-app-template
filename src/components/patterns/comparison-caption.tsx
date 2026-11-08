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
 * The comparison the charts and tables below use, with its exact dates and
 * coverage notes on demand. `issues` are each slot's coverageIssue() reason
 * changes are hidden; they stay on screen. `switchable` offers the switch
 * between slots; turn it off when nothing on the view has a per-slot variant.
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
    <div className="flex flex-col gap-2" data-slot="comparison-caption">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        {switchable && (
          <BaselineSwitch
            labels={[switchLabel(plan.slots[0]), switchLabel(plan.slots[1])]}
            available={[plan.slots[0].range !== null, plan.slots[1].range !== null]}
          />
        )}
        <Disclosure
          aria-label="Comparison periods"
          summary="Comparison dates"
          variant="note"
          className="open:basis-full"
        >
          <p>{text}</p>
          {children}
        </Disclosure>
      </div>
      {/* A reason both comparisons share is said once; different reasons name their comparison. */}
      {new Set(issues.filter(Boolean)).size === 1 && issues.filter(Boolean).length > 1 ? (
        <ComparisonIssue issue={issues.find(Boolean)} />
      ) : (
        issues.map((issue, index) =>
          issue ? (
            <ComparisonIssue
              key={index}
              issue={`${plan.slots[index] ? switchLabel(plan.slots[index]) : "Comparison"}: ${issue}`}
            />
          ) : null,
        )
      )}
    </div>
  );
}

function switchLabel(slot: Baseline): string {
  return slot.short.charAt(0).toUpperCase() + slot.short.slice(1);
}

/** Why period changes are hidden, for views that learn it only after their data loads. */
function ComparisonIssue({ issue }: { issue?: string | null }) {
  return issue ? (
    <p data-comparison-issue className="max-w-prose text-sm">
      {issue}
    </p>
  ) : null;
}
