import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { SelectFilter } from "@/components/patterns/select-filter";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { coverageIssue } from "@/lib/comparison";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { decimalToNumber, nonnegativeShare } from "@/lib/data/decimal";
import { formatMoney, formatPercent } from "@/lib/format";
import { withParams, type SearchParams } from "@/lib/filters";
import type { Comparison } from "@/lib/comparison";
import {
  BREAKDOWN_DIMENSIONS,
  type BreakdownDimension,
  type PaidMarketingFilters,
  type SpendBreakdown,
} from "./queries";

export function SpendBreakdownView({
  data,
  filters,
  dimension,
  comparison,
  params,
}: {
  data: SpendBreakdown;
  filters: PaidMarketingFilters;
  dimension: BreakdownDimension;
  comparison?: Comparison;
  params: SearchParams;
}) {
  const first = data.rows[0];
  const total = first?.total_spend ?? null;
  const baseline = comparison?.range;
  const issue =
    baseline && first ? coverageIssue(filters.range, baseline, first.latest_date, first.previous_latest_date) : null;
  const compare = Boolean(baseline) && !issue;
  return (
    <section aria-label="Spend breakdown" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <SelectFilter
          name="breakdown"
          label="Break down spend by"
          value={dimension}
          options={[...BREAKDOWN_DIMENSIONS]}
        />
        {comparison && <ComparisonCaption comparison={comparison} issue={issue} />}
      </div>
      <RankedBreakdown
        title={`Spend by ${dimension}`}
        valueLabel="Spend"
        description={`Spend in the selected period: ${formatMoney(total)}. ${data.hasMore ? "Top 10 by spend. " : ""}Shares use all matching rows for this store, date range, and channel. Zero totals and negative spend have no share.`}
        comparisonLabel={compare ? "Change vs comparison" : undefined}
        hasMore={data.hasMore}
        rows={data.rows.map((row) => ({
          id: row.dimension_key,
          label: dimension === "campaign" ? `${row.label} (${row.dimension_key})` : row.label,
          value: { value: decimalToNumber(row.spend), display: formatMoney(row.spend) },
          share: formatPercent(nonnegativeShare(row.spend, total, first?.minimum_spend ?? null)),
          change: compare ? kpiDelta(row.spend, row.previous_spend, formatMoney).display : undefined,
          href:
            dimension === "channel"
              ? withParams("/paid-marketing", params, {
                  store: filters.storeId,
                  ...filters.range,
                  channel: row.dimension_key,
                })
              : undefined,
        }))}
      />
    </section>
  );
}
