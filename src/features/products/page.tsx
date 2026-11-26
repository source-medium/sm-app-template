import Link from "next/link";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { drillDown } from "@/lib/drill-down";
import { MAX_PRODUCTS, MAX_PRODUCT_ROWS, MAX_PRODUCT_SEARCH, PRODUCT_PAGE_SIZE, PRODUCTS_RELATION } from "./rows";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { SectionHeader } from "@/components/patterns/section-header";
import { ReportSearch } from "@/components/patterns/report-search";
import { ProductPager } from "./pager";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { KpiCard, type KpiDelta } from "@/components/patterns/kpi-card";
import { ComparisonCaption, PlanSwitch } from "@/components/patterns/comparison-caption";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { kpiDelta, slotDeltas } from "@/components/patterns/kpi-delta";
import { slotColumn } from "@/lib/data/period-sql";
import { ProductCosts } from "./costs";
import { ProductPhoto } from "./product-image";
import { ReportControls } from "@/components/shell/report-controls";
import { productNames } from "./names";
import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { ChannelRosterFilter } from "@/components/patterns/channel-filter";
import { SelectFilter } from "@/components/patterns/select-filter";
import { planRanges, slotChanges } from "@/lib/comparison";
import { nonnegativeShare } from "@/lib/data/decimal";
import { formatCount, formatMeasure, formatMoneyIn, moneyAxis } from "@/lib/format";
import { reportSalesChannel, salesChannelLabel, withParams, type SearchParams } from "@/lib/filters";
import { Disclosure } from "@/components/ui/disclosure";
import {
  getProductCoverage,
  getProductChannels,
  getProducts,
  getProductImages,
  productOptions,
  PRODUCT_DIMENSIONS,
  PRODUCT_METRICS,
  productPolarity,
  PRODUCT_RANKINGS,
} from "./queries";

export const metadata: Metadata = { title: "Products" };
export default async function ProductsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const options = productOptions(params);
  const channel = reportSalesChannel(params);
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
      description="What is selling, ranked by the measure you choose."
      pathname="/products"
      params={params}
      agentFilters={{
        sales_channel: channel,
        dimension: options.dimension,
        metric: options.metric,
        ranking: options.ranking,
        q: options.q,
      }}
      agentOmissions={options.entity ? ["Selected product or variant identity"] : []}
      comparisons
    >
      {({ filters, dates, plan, timeZone, currency, dataStatus, params: applied }) => {
        const money = formatMoneyIn(currency);
        const format = options.metric === "units" || options.metric === "refunded_units" ? formatMeasure : money;
        const metricLabel = PRODUCT_METRICS.find((item) => item.value === options.metric)?.label ?? "Net revenue";
        return (
          <>
            <ReportControls
              summary={[
                salesChannelLabel(channel),
                `${options.entity ? "Selected " : ""}${options.dimension === "product" ? "Products" : "Variants"}`,
                metricLabel,
                PRODUCT_RANKINGS.find((item) => item.value === options.ranking)?.label,
                options.q && `Search “${options.q}”`,
              ]}
            >
              <ChannelRosterFilter
                key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}`}
                load={() => getProductChannels(filters)}
                value={channel}
                loadingLabel="Loading sales channels"
              />
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
              <SelectFilter name="ranking" label="Ranking" value={options.ranking} options={[...PRODUCT_RANKINGS]} />
              <SelectFilter name="metric" label="Rank by" value={options.metric} options={[...PRODUCT_METRICS]} />
            </ReportControls>
            {dataStatus}
            {options.entity && (
              <p className="text-sm">All totals below are scoped to the selected {options.dimension} identity.</p>
            )}
            {/* The search narrows the ranked list, so it sits in the list's header, as on Orders. */}
            <SectionHeader
              title={`${options.entity ? "Selected" : "Ranked"} ${options.dimension === "product" ? "products" : "variants"}`}
              description="Totals cover every product in the period; the search narrows the ranked list."
              actions={
                <div className="flex flex-wrap items-end gap-3">
                  <ReportSearch
                    label={`Find a ${options.dimension}`}
                    placeholder="Title, product ID or SKU"
                    value={options.q ?? ""}
                    maxLength={MAX_PRODUCT_SEARCH}
                  />
                  <Link
                    prefetch={false}
                    className={buttonVariants({ variant: "outline", size: "sm" })}
                    href={withParams("/products/export", applied, { page: null })}
                  >
                    <Download aria-hidden /> Download CSV
                  </Link>
                </div>
              }
            />
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${options.dimension}|${options.metric}|${options.entity}|${options.ranking}|${options.q}|${options.page}|${plan?.slots[0].mode}|${plan?.slots[1].mode}|${channel}`}
              fallback={<LoadingState variant="chart" label="Loading products" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() => getProducts({ ...filters, ...options, channel }, planRanges(plan))}
                isEmpty={(data) => data.rows.length === 0}
                emptyMessage={
                  options.page > 1
                    ? "This page is past the matching products."
                    : options.q
                      ? `No ${options.dimension === "product" ? "products" : "variants"} match “${options.q}” in this store, sales channel, and date range.`
                      : "No valid-order product lines match this store, sales channel, and date range."
                }
                emptyAction={
                  options.page > 1
                    ? { href: withParams("/products", params, { page: null }), label: "Go to the first page" }
                    : options.q
                      ? { href: withParams("/products", params, { q: null }), label: "Clear the search" }
                      : channel
                        ? {
                            href: withParams("/products", params, { sales_channel: null }),
                            label: "Show all sales channels",
                          }
                        : undefined
                }
              >
                {(data) => {
                  const images = getProductImages(
                    { storeId: filters.storeId, dimension: options.dimension },
                    data.rows,
                  );
                  const first = data.rows[0];
                  const changes = plan ? slotChanges(plan, first) : null;
                  /** Both comparison rows for a total, in slot order; a slot without changes says why. */
                  const deltas = (
                    metric: (typeof PRODUCT_METRICS)[number]["value"],
                    formatValue: (value: string | null) => string,
                  ): KpiDelta[] =>
                    slotDeltas(plan, changes, (label, slot) =>
                      kpiDelta(
                        first?.[`total_${metric}`] ?? null,
                        first?.[`total_${slotColumn(slot, metric)}`] ?? null,
                        formatValue,
                        productPolarity(metric),
                        label,
                      ),
                    );
                  const productName = productNames(data.rows);
                  const productHref = (productKey: string) =>
                    drillDown(
                      {
                        store: filters.storeId,
                        dates: dates.live,
                        dateBasis: "processed-only",
                        population: "valid-order lines",
                        comparison: plan?.slots[0].mode,
                        comparison2: plan?.slots[1].mode,
                        filters: { sales_channel: channel, entity: productKey },
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
                    ).href ?? undefined;
                  const firstRow = (data.page - 1) * PRODUCT_PAGE_SIZE + 1;
                  const pageHref = (page: number) =>
                    withParams("/products", params, { page: page === 1 ? null : String(page) });
                  const pager = (
                    <ProductPager
                      first={firstRow}
                      last={firstRow + data.rows.length - 1}
                      matched={formatCount(data.matched)}
                      bound={data.truncated ? MAX_PRODUCT_ROWS : null}
                      previous={data.page > 1 ? pageHref(data.page - 1) : null}
                      next={data.hasMore ? pageHref(data.page + 1) : null}
                    />
                  );
                  // Gainers and decliners are ranked against the first comparison in SQL, so that list
                  // has one variant; ranking by value shows either slot's changes beside the same rows.
                  const perSlot = Boolean(plan) && options.ranking === "value";
                  /** The ranked list for one comparison slot; both are rendered and the active one shows. */
                  const ranking = (slot: 0 | 1) => {
                    const baseline = plan?.slots[slot];
                    const compare = Boolean(changes?.[slot].show && baseline?.range);
                    return (
                      <RankedBreakdown
                        title={`${metricLabel} by ${options.dimension}`}
                        categoryLabel={
                          PRODUCT_DIMENSIONS.find((item) => item.value === options.dimension)?.label ??
                          options.dimension
                        }
                        valueLabel={metricLabel}
                        valueFormat={format === money ? moneyAxis(currency) : "number"}
                        description={
                          options.ranking === "value"
                            ? "By the selected measure."
                            : `${options.ranking === "gainers" ? "Gainers" : "Decliners"} vs ${plan?.slots[0].label ?? "the first comparison"}.`
                        }
                        tableFirst
                        // The chart shows the leaders; later pages are the table alone.
                        chartRows={data.page === 1 ? MAX_PRODUCTS : 0}
                        tableActions={pager}
                        baselineLabel={compare ? baseline?.short : undefined}
                        formatValue={format}
                        better={productPolarity(options.metric)}
                        rows={data.rows.map((row) => ({
                          id: row.product_key,
                          label: productName(row),
                          chartLabel: row.label,
                          leading: <ProductPhoto images={images} productKey={row.product_key} />,
                          href: productHref(row.product_key),
                          value: row[options.metric],
                          baseline: row[slotColumn(slot, options.metric)],
                          share: nonnegativeShare(
                            row[options.metric],
                            row[`total_${options.metric}`],
                            row.minimum_value,
                          ),
                        }))}
                      />
                    );
                  };
                  return (
                    <div className="flex flex-col gap-6">
                      {plan && (
                        <ComparisonCaption
                          plan={plan}
                          issues={changes?.map((change) => change.issue)}
                          switchable={false}
                        />
                      )}
                      <section aria-label="All product totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                        {PRODUCT_METRICS.slice(0, 2).map((item) => {
                          const formatValue = item.value === "units" ? formatMeasure : money;
                          return (
                            <KpiCard
                              key={item.value}
                              label={item.label}
                              value={formatValue(first?.[`total_${item.value}`] ?? null)}
                              deltas={deltas(item.value, formatValue)}
                              description={
                                item.value === "revenue"
                                  ? "Order line net revenue for the matching products and channels. Overview's net revenue is the order-level figure, so the two can differ."
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
                      {options.ranking !== "value" && !changes?.[0].show ? (
                        <ErrorState
                          title="Period ranking unavailable"
                          remedy="Choose a first comparison with sufficient matching coverage to rank period gainers or decliners, or select Largest value."
                          tone="warning"
                        />
                      ) : perSlot && plan ? (
                        // The switch sits with the ranking, the only section that draws a comparison.
                        <div className="flex flex-col gap-3">
                          <PlanSwitch plan={plan} />
                          <ActiveBaseline a={ranking(0)} b={ranking(1)} />
                        </div>
                      ) : (
                        ranking(0)
                      )}
                      <Disclosure summary="About product metrics" variant="note">
                        <div className="max-w-prose space-y-2">
                          <p data-metric-definition="Product metrics">
                            Valid orders only. Net units subtract refunded quantities. Product gross profit subtracts
                            product cost from net revenue; it excludes shipping, fulfillment and payment costs. Missing
                            product costs can overstate profit. Refund amounts and quantities are shown as positive
                            deductions (source signs reversed); reversals stay negative. Refunds are associated with
                            orders processed in this range, not the dates refunds were issued.
                          </p>
                          <p>
                            Shares and headline totals include all matching products. Shares are unavailable for zero
                            totals or negative values.
                          </p>
                          {options.ranking !== "value" && (
                            <p>
                              Gainers and decliners rank absolute changes against the first comparison period, using the
                              same valid-order line population. Missing comparison values sort last and are not zero.
                              Changes remain hidden when comparison coverage is insufficient.
                            </p>
                          )}
                        </div>
                      </Disclosure>
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
