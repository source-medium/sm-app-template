import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { SelectFilter } from "@/components/patterns/select-filter";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { decimalToNumber, ratio, toUnits } from "@/lib/data/decimal";
import { formatDate, formatMoney, formatPercent } from "@/lib/format";
import { preservedParams, withParams, type SearchParams } from "@/lib/filters";
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
  const canShare =
    total !== null &&
    toUnits(total) > 0n &&
    first?.minimum_spend !== null &&
    toUnits(first?.minimum_spend ?? "-1") >= 0n;
  const baseline = comparison?.range;
  return (
    <section aria-label="Spend breakdown" className="flex flex-col gap-3">
      <SelectFilter
        pathname="/paid-marketing"
        name="breakdown"
        label="Break down spend by"
        value={dimension}
        options={[...BREAKDOWN_DIMENSIONS]}
        preserved={preservedParams(params, ["channel", "metric", "compare"], filters)}
      />
      <p className="text-sm text-muted-foreground">
        Selected-period spend: {formatMoney(total)}.{" "}
        {baseline
          ? `Compared with ${formatDate(baseline.from)} – ${formatDate(baseline.to)}.`
          : "Comparison off or unavailable."}
      </p>
      <RankedBreakdown
        title={`Spend by ${dimension}`}
        valueLabel="Spend"
        description={`${data.hasMore ? "Top 10 by selected-period spend. " : ""}Shares use all matching rows for this store, date range, and channel. Zero totals and negative spend have no share.`}
        comparisonLabel={baseline ? "Change vs comparison" : undefined}
        hasMore={data.hasMore}
        rows={data.rows.map((row) => ({
          id: row.dimension_key,
          label: dimension === "campaign" ? `${row.label} (${row.dimension_key})` : row.label,
          value: { value: decimalToNumber(row.spend), display: formatMoney(row.spend) },
          share: formatPercent(canShare ? ratio(decimalToNumber(row.spend), decimalToNumber(total)) : null),
          change: baseline ? kpiDelta(row.spend, row.previous_spend, formatMoney).display : undefined,
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
