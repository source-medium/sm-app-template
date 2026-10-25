import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { slotChanges, type ComparisonPlan } from "@/lib/comparison";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { slotColumn } from "@/lib/data/period-sql";
import { decimalToNumber, nonnegativeShare } from "@/lib/data/decimal";
import { formatMoney, formatMoneyIn, formatPercent } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/filters";
import type { BreakdownDimension } from "./filters";
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
  /** The ranking for one comparison slot; both are rendered and the active one shows. */
  const ranking = (slot: 0 | 1) => {
    const baseline = plan?.slots[slot];
    const compare = Boolean(changes?.[slot].show && baseline?.range);
    return (
      <RankedBreakdown
        title={`Spend by ${dimension === "type" || dimension === "tactic" ? `campaign ${dimension}` : dimension}`}
        valueLabel="Spend"
        description={`Spend in the selected period: ${formatMoney(total, currency)}. ${data.hasMore ? "Top 10 by spend. " : ""}Shares use all matching rows for this store, date range, and channel. Zero totals and negative spend have no share.`}
        comparisonLabel={compare && baseline ? `Change vs ${baseline.label}` : undefined}
        hasMore={data.hasMore}
        rows={data.rows.map((row) => ({
          id: row.dimension_key,
          label: dimension === "campaign" ? `${row.label} (${row.dimension_key})` : row.label,
          value: { value: decimalToNumber(row.spend), display: money(row.spend) },
          share: formatPercent(nonnegativeShare(row.spend, total, first?.minimum_spend ?? null)),
          change: compare ? kpiDelta(row.spend, row[slotColumn(slot, "spend")], money).display : undefined,
          href:
            dimension === "channel"
              ? withParams("/paid-marketing", params, { store: filters.storeId, channel: row.dimension_key })
              : undefined,
        }))}
      />
    );
  };
  return (
    <section aria-label="Spend breakdown" className="flex flex-col gap-3">
      {plan && <ComparisonCaption plan={plan} issues={changes?.map((change) => change.issue)} />}
      {(dimension === "type" || dimension === "tactic") && (
        <p className="text-sm text-muted-foreground">
          Published campaign classifications. Unclassified rows appear as (none); types and tactics are not inferred
          from campaign names.
        </p>
      )}
      {plan ? <ActiveBaseline a={ranking(0)} b={ranking(1)} /> : ranking(0)}
    </section>
  );
}
