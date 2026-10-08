import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { KpiCard } from "@/components/patterns/kpi-card";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { SelectFilter } from "@/components/patterns/select-filter";
import { decimalToNumber, nonnegativeShare } from "@/lib/data/decimal";
import { formatDate, formatMeasure, formatMoney, formatPercent } from "@/lib/format";
import { parseSalesChannel, type SearchParams } from "@/lib/filters";
import { getProductChannels, getProducts, productOptions, PRODUCT_DIMENSIONS, PRODUCT_METRICS } from "./queries";

export const metadata: Metadata = { title: "Products" };
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const options = productOptions(params);
  const channel = parseSalesChannel(params);
  return (
    <ReportPage
      title="Products"
      description="Product and variant performance from valid-order lines, in reporting currency."
      pathname="/products"
      params={params}
      agentFilters={{ sales_channel: channel, dimension: options.dimension, metric: options.metric }}
      comparisons
    >
      {({ filters, comparison }) => {
        const baseline = comparison?.range ?? null;
        const format = options.metric === "units" ? formatMeasure : formatMoney;
        const metricLabel = PRODUCT_METRICS.find((item) => item.value === options.metric)?.label ?? "Net revenue";
        return (
          <>
            <div className="flex flex-wrap gap-4">
              <Suspense
                key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}`}
                fallback={<LoadingState variant="control" label="Loading sales channels" />}
              >
                <DataRegion
                  timestamp={false}
                  load={() => getProductChannels(filters)}
                  isEmpty={() => false}
                  emptyMessage="No sales channels in this range."
                >
                  {(channels) => <ChannelFilter value={channel} channels={channels} />}
                </DataRegion>
              </Suspense>
              <SelectFilter
                name="dimension"
                label="Group by"
                value={options.dimension}
                options={[...PRODUCT_DIMENSIONS]}
              />
              <SelectFilter name="metric" label="Rank by" value={options.metric} options={[...PRODUCT_METRICS]} />
            </div>
            <details className="text-sm text-muted-foreground">
              <summary className="cursor-pointer font-medium">About product metrics</summary>
              <p className="mt-2 max-w-prose">
                Valid orders only. Net units subtract refunded quantities. Product gross profit subtracts product cost
                from net revenue; it excludes shipping, fulfillment and payment costs. Missing product costs can
                overstate profit.
              </p>
            </details>
            {baseline && (
              <p className="text-sm text-muted-foreground">
                Compared with {formatDate(baseline.from)} – {formatDate(baseline.to)}.
              </p>
            )}
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${options.dimension}|${options.metric}|${comparison?.mode}|${channel}`}
              fallback={<LoadingState variant="chart" label="Loading products" />}
            >
              <DataRegion
                load={() => getProducts({ ...filters, ...options, channel }, baseline)}
                isEmpty={(data) => data.rows.length === 0}
                emptyMessage="No valid-order product lines match this store, sales channel, and date range."
              >
                {(data) => {
                  const first = data.rows[0];
                  return (
                    <div className="flex flex-col gap-6">
                      <section aria-label="All product totals" className="grid gap-4 sm:grid-cols-3">
                        {PRODUCT_METRICS.map((item) => {
                          const formatValue = item.value === "units" ? formatMeasure : formatMoney;
                          return (
                            <KpiCard
                              key={item.value}
                              label={item.label}
                              value={formatValue(first?.[`total_${item.value}`] ?? null)}
                              period="All matching products in the selected period"
                              delta={
                                baseline
                                  ? kpiDelta(
                                      first?.[`total_${item.value}`] ?? null,
                                      first?.[`total_previous_${item.value}`] ?? null,
                                      formatValue,
                                    )
                                  : undefined
                              }
                            />
                          );
                        })}
                      </section>
                      <RankedBreakdown
                        title={`${metricLabel} by ${options.dimension}`}
                        valueLabel={metricLabel}
                        description="Top 10 by the selected measure. Shares and headline totals include all matching products. Shares are unavailable for zero totals or negative values."
                        hasMore={data.hasMore}
                        comparisonLabel={baseline ? "Change vs comparison" : undefined}
                        rows={data.rows.map((row) => ({
                          id: row.product_key,
                          label: `${row.label} (${row.reference})`,
                          value: { value: decimalToNumber(row[options.metric]), display: format(row[options.metric]) },
                          share: formatPercent(
                            nonnegativeShare(row[options.metric], row[`total_${options.metric}`], row.minimum_value),
                          ),
                          change: baseline
                            ? kpiDelta(row[options.metric], row[`previous_${options.metric}`], format).display
                            : undefined,
                        }))}
                      />
                    </div>
                  );
                }}
              </DataRegion>
            </Suspense>
          </>
        );
      }}
    </ReportPage>
  );
}
