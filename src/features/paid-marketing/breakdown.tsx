import { PlanSwitch } from "@/components/patterns/comparison-caption";
import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { slotChanges, type ComparisonPlan } from "@/lib/comparison";
import { slotColumn } from "@/lib/data/period-sql";
import { nonnegativeShare } from "@/lib/data/decimal";
import { formatMoneyIn, moneyAxis } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/filters";
import { adPlatformLabel } from "@/lib/ad-platforms";
import { PlatformMark } from "@/components/patterns/platform-mark";
import { BREAKDOWN_DIMENSIONS, type BreakdownDimension } from "./filters";
import { type PaidMarketingFilters, type SpendBreakdown } from "./queries";

export function SpendBreakdownView({
  data,
  filters,
  dimension,
  plan,
  params,
  currency,
}: {
  data: SpendBreakdown;
  filters: PaidMarketingFilters;
  dimension: BreakdownDimension;
  plan?: ComparisonPlan;
  params: SearchParams;
  currency: string | null;
}) {
  const money = formatMoneyIn(currency);
  const first = data.rows[0];
  const total = first?.total_spend ?? null;
  const changes = plan ? slotChanges(plan, first) : null;
  const label = BREAKDOWN_DIMENSIONS.find((item) => item.value === dimension)?.label ?? dimension;
  /** The ranking for one comparison slot; both are rendered and the active one shows. */
  const ranking = (slot: 0 | 1) => {
    const baseline = plan?.slots[slot];
    const compare = Boolean(changes?.[slot].show && baseline?.range);
    return (
      <RankedBreakdown
        title={`Spend by ${label.toLowerCase()}`}
        categoryLabel={label}
        valueLabel="Spend"
        valueFormat={moneyAxis(currency)}
        description={data.hasMore ? "Top 10 by spend." : "Ranked by spend."}
        baselineLabel={compare ? baseline?.short : undefined}
        formatValue={money}
        better="neutral"
        hasMore={data.hasMore}
        rows={data.rows.map((row) => ({
          id: row.dimension_key,
          label:
            dimension === "campaign"
              ? `${row.label} (${row.dimension_key})`
              : dimension === "channel"
                ? adPlatformLabel(row.label)
                : row.label,
          leading: dimension === "channel" ? <PlatformMark platform={row.label} /> : undefined,
          value: row.spend,
          baseline: row[slotColumn(slot, "spend")],
          share: nonnegativeShare(row.spend, total, first?.minimum_spend ?? null),
          href:
            dimension === "channel"
              ? withParams("/paid-marketing", params, { store: filters.storeId, channel: row.dimension_key })
              : undefined,
        }))}
      />
    );
  };
  return (
    <div className="flex flex-col gap-3">
      {plan && <PlanSwitch plan={plan} />}
      {(dimension === "type" || dimension === "tactic") && (
        <p className="text-sm text-muted-foreground">
          Published campaign classifications. Unclassified rows appear as (none); types and tactics are not inferred
          from campaign names.
        </p>
      )}
      {plan ? <ActiveBaseline a={ranking(0)} b={ranking(1)} /> : ranking(0)}
    </div>
  );
}
