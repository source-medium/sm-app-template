import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { slotChanges, type ComparisonPlan } from "@/lib/comparison";
import { changeCell, kpiDelta } from "@/components/patterns/kpi-delta";
import { slotColumn } from "@/lib/data/period-sql";
import { decimalToNumber, nonnegativeShare } from "@/lib/data/decimal";
import { formatMoney, formatMoneyIn } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/filters";
import { adPlatformLabel } from "@/lib/ad-platforms";
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
  const title = BREAKDOWN_DIMENSIONS.find((item) => item.value === dimension)?.label.toLowerCase();
  /** The ranking for one comparison slot; both are rendered and the active one shows. */
  const ranking = (slot: 0 | 1) => {
    const baseline = plan?.slots[slot];
    const compare = Boolean(changes?.[slot].show && baseline?.range);
    return (
      <RankedBreakdown
        title={`Spend by ${title}`}
        valueLabel="Spend"
        description={`${formatMoney(total, currency)} in the selected period.${data.hasMore ? " Top 10 by spend." : ""}`}
        comparisonLabel={compare && baseline ? `Change vs ${baseline.short}` : undefined}
        hasMore={data.hasMore}
        rows={data.rows.map((row) => ({
          id: row.dimension_key,
          label:
            dimension === "campaign"
              ? `${row.label} (${row.dimension_key})`
              : dimension === "channel"
                ? adPlatformLabel(row.label)
                : row.label,
          value: { value: decimalToNumber(row.spend), display: money(row.spend) },
          share: nonnegativeShare(row.spend, total, first?.minimum_spend ?? null),
          // Spend is neither good nor bad on its own, so its change stays uncolored.
          change: compare
            ? changeCell(kpiDelta(row.spend, row[slotColumn(slot, "spend")], money, "neutral"))
            : undefined,
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
      {plan && <ComparisonCaption plan={plan} issues={changes?.map((change) => change.issue)} />}
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
