import Link from "next/link";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { drillDown } from "@/lib/drill-down";
import { PRODUCTS_RELATION } from "./rows";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { KpiCard } from "@/components/patterns/kpi-card";
import { ComparisonCaption, ComparisonIssue } from "@/components/patterns/comparison-caption";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { ProductCosts } from "./costs";
import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { SelectFilter } from "@/components/patterns/select-filter";
import { periodChanges } from "@/lib/comparison";
import { decimalToNumber, nonnegativeShare } from "@/lib/data/decimal";
import { formatMeasure, formatMoneyIn, formatPercent } from "@/lib/format";
import { parseSalesChannel, withParams, type SearchParams } from "@/lib/filters";
import { Disclosure } from "@/components/ui/disclosure";
import {
  getProductCoverage,
  getProductChannels,
  getProducts,
  productOptions,
  PRODUCT_DIMENSIONS,
  PRODUCT_METRICS,
} from "./queries";

export const metadata: Metadata = { title: "Products" };
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const options = productOptions(params);
  const channel = parseSalesChannel(params);
  const diagnostic =
    options.metric === "profit"
      ? "cost"
      : options.metric === "refunds" || options.metric === "refunded_units"
        ? "refunds"
        : null;
  return (
    <ReportPage
      dataStatusAfterControls
      sources={[
        {
          relation: PRODUCTS_RELATION,
          scope:
            "Valid-order lines aggregated by product or variant, filtered by local processed date and sales channel.",
        },
      ]}
      title="Products"
      description="Product and variant performance from valid-order lines, in reporting currency."
      pathname="/products"
      params={params}
      agentFilters={{
        sales_channel: channel,
        dimension: options.dimension,
        metric: options.metric,
        ranking: options.ranking,
      }}
      agentOmissions={options.entity ? ["Selected product or variant identity"] : []}
      comparisons
    >
      {({ filters, comparison, timeZone, currency, dataStatus }) => {
        const baseline = comparison?.range ?? null;
        const money = formatMoneyIn(currency);
        const format = options.metric === "units" || options.metric === "refunded_units" ? formatMeasure : money;
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
              {!options.entity && (
                <SelectFilter
                  name="dimension"
                  label="Group by"
                  value={options.dimension}
                  options={[...PRODUCT_DIMENSIONS]}
                />
              )}
              {options.entity && (
                <>
                  <input type="hidden" name="entity" value={options.entity} form={REPORT_FILTER_FORM_ID} />
                  <input type="hidden" name="dimension" value={options.dimension} form={REPORT_FILTER_FORM_ID} />
                  <Link
                    prefetch={false}
                    className="py-2 text-sm underline"
                    href={withParams("/products", params, { entity: null })}
                  >
                    Clear selected {options.dimension}
                  </Link>
                </>
              )}
              <SelectFilter
                name="ranking"
                label="Ranking"
                value={options.ranking}
                options={[
                  { value: "value", label: "Largest value" },
                  { value: "gainers", label: "Period gainers" },
                  { value: "decliners", label: "Period decliners" },
                ]}
              />
              <SelectFilter name="metric" label="Rank by" value={options.metric} options={[...PRODUCT_METRICS]} />
            </div>
            {dataStatus}
            <Disclosure summary="About product metrics" className="text-sm text-muted-foreground">
              <p data-metric-definition="Product metrics" className="max-w-prose">
                Valid orders only. Net units subtract refunded quantities. Product gross profit subtracts product cost
                from net revenue; it excludes shipping, fulfillment and payment costs. Missing product costs can
                overstate profit. Refund amounts and quantities are shown as positive deductions (source signs
                reversed); reversals stay negative. Refunds are associated with orders processed in this range, not the
                dates refunds were issued.
              </p>
            </Disclosure>
            {comparison && <ComparisonCaption comparison={comparison} />}
            {options.ranking !== "value" && (
              <p className="text-sm text-muted-foreground">
                Gainers and decliners rank absolute period changes, using the same valid-order line population. Missing
                comparison values sort last. Changes remain hidden when comparison coverage is insufficient.
              </p>
            )}
            {options.entity && (
              <p className="text-sm">All totals below are scoped to the selected {options.dimension} identity.</p>
            )}
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${options.dimension}|${options.metric}|${options.entity}|${options.ranking}|${comparison?.mode}|${channel}`}
              fallback={<LoadingState variant="chart" label="Loading products" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() => getProducts({ ...filters, ...options, channel }, baseline)}
                isEmpty={(data) => data.rows.length === 0}
                emptyMessage="No valid-order product lines match this store, sales channel, and date range."
                emptyAction={
                  channel
                    ? {
                        href: withParams("/products", params, { sales_channel: null }),
                        label: "Show all sales channels",
                      }
                    : undefined
                }
              >
                {(data) => {
                  const first = data.rows[0];
                  const { show: compare, issue } = periodChanges(filters.range, baseline, first);
                  return (
                    <div className="flex flex-col gap-6">
                      <ComparisonIssue issue={issue} />
                      <section aria-label="All product totals" className="grid gap-4 sm:grid-cols-2">
                        {PRODUCT_METRICS.slice(0, 2).map((item) => {
                          const formatValue = item.value === "units" ? formatMeasure : money;
                          return (
                            <KpiCard
                              key={item.value}
                              label={item.label}
                              value={formatValue(first?.[`total_${item.value}`] ?? null)}
                              period="All matching products in the selected period"
                              delta={
                                compare
                                  ? kpiDelta(
                                      first?.[`total_${item.value}`] ?? null,
                                      first?.[`total_previous_${item.value}`] ?? null,
                                      formatValue,
                                      "higher",
                                    )
                                  : undefined
                              }
                            />
                          );
                        })}
                      </section>
                      {diagnostic && (
                        <Suspense
                          key={`coverage|${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${diagnostic}|${options.entity}|${options.dimension}`}
                          fallback={<LoadingState variant="control" label="Loading product diagnostics" />}
                        >
                          <DataRegion
                            timestamp={false}
                            load={() =>
                              getProductCoverage({
                                ...filters,
                                channel,
                                entity: options.entity,
                                dimension: options.dimension,
                              })
                            }
                            isEmpty={(data) => data.lines === 0n}
                            emptyMessage="No valid-order lines for product diagnostics."
                          >
                            {(data) => <ProductCosts data={data} diagnostic={diagnostic} />}
                          </DataRegion>
                        </Suspense>
                      )}
                      {options.ranking !== "value" && !compare ? (
                        <ErrorState
                          title="Period ranking unavailable"
                          remedy="Choose a comparison with sufficient matching coverage to rank period gainers or decliners, or select Largest value."
                          tone="warning"
                        />
                      ) : (
                        <RankedBreakdown
                          title={`${metricLabel} by ${options.dimension}`}
                          valueLabel={metricLabel}
                          description={
                            options.ranking === "value"
                              ? "Top 10 by the selected measure. Shares and headline totals include all matching products. Shares are unavailable for zero totals or negative values."
                              : `Top 10 ${options.ranking} by absolute change in the selected measure. Shares and headline totals use the same full scoped population; a missing comparison is not zero.`
                          }
                          hasMore={data.hasMore}
                          comparisonLabel={compare ? "Change vs comparison" : undefined}
                          rows={data.rows.map((row) => ({
                            id: row.product_key,
                            label: `${row.label} (${row.reference})`,
                            chartLabel: row.label,
                            href:
                              drillDown(
                                {
                                  store: filters.storeId,
                                  ...filters.range,
                                  dateBasis: "processed-only",
                                  population: "valid-order lines",
                                  comparison: comparison?.mode,
                                  filters: { sales_channel: channel, entity: row.product_key },
                                },
                                {
                                  pathname: "/products",
                                  dateBasis: "processed-only",
                                  population: "valid-order lines",
                                  supportsComparison: true,
                                  filters: { sales_channel: "sales_channel", entity: "entity" },
                                  required: {
                                    dimension: options.dimension,
                                    metric: options.metric,
                                    ranking: options.ranking,
                                  },
                                },
                              ).href ?? undefined,
                            value: {
                              value: decimalToNumber(row[options.metric]),
                              display: format(row[options.metric]),
                            },
                            share: formatPercent(
                              nonnegativeShare(row[options.metric], row[`total_${options.metric}`], row.minimum_value),
                            ),
                            change: compare
                              ? kpiDelta(row[options.metric], row[`previous_${options.metric}`], format).display
                              : undefined,
                          }))}
                        />
                      )}
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
