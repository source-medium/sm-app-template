import Link from "next/link";
import { REPORT_FILTER_FORM_ID } from "@/lib/filters";
import { drillDown } from "@/lib/drill-down";
import { PRODUCTS_RELATION } from "./rows";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { KpiCard, type KpiDelta } from "@/components/patterns/kpi-card";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { kpiDelta, slotDeltas } from "@/components/patterns/kpi-delta";
import { slotColumn } from "@/lib/data/period-sql";
import { ProductCosts } from "./costs";
import { ProductPhoto } from "./product-image";
import { ProductGallery } from "./product-gallery";
import { ReportControls } from "@/components/shell/report-controls";
import { ReportTakeaway } from "@/components/patterns/report-takeaway";
import { RankedBreakdown } from "@/components/patterns/ranked-breakdown";
import { ChannelRosterFilter } from "@/components/patterns/channel-filter";
import { SelectFilter } from "@/components/patterns/select-filter";
import { planRanges, slotChanges } from "@/lib/comparison";
import { decimalToNumber, nonnegativeShare } from "@/lib/data/decimal";
import { formatMeasure, formatMoneyIn, formatPercent } from "@/lib/format";
import { parseSalesChannel, salesChannelLabel, withParams, type SearchParams } from "@/lib/filters";
import { Disclosure } from "@/components/ui/disclosure";
import {
  getProductCoverage,
  getProductChannels,
  getProducts,
  getProductImages,
  productOptions,
  PRODUCT_DIMENSIONS,
  PRODUCT_METRICS,
  PRODUCT_RANKINGS,
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
      {({ filters, dates, plan, timeZone, currency, dataStatus }) => {
        const money = formatMoneyIn(currency);
        const format = options.metric === "units" || options.metric === "refunded_units" ? formatMeasure : money;
        const metricLabel = PRODUCT_METRICS.find((item) => item.value === options.metric)?.label ?? "Net revenue";
        return (
          <>
            <ReportControls
              collapseOnDesktop
              summary={`${salesChannelLabel(channel)} · ${options.entity ? "Selected " : ""}${options.dimension === "product" ? "Products" : "Variants"} · ${metricLabel} · ${PRODUCT_RANKINGS.find((item) => item.value === options.ranking)?.label}`}
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
            <Disclosure summary="About product metrics" className="text-sm text-muted-foreground">
              <p data-metric-definition="Product metrics" className="max-w-prose">
                Valid orders only. Net units subtract refunded quantities. Product gross profit subtracts product cost
                from net revenue; it excludes shipping, fulfillment and payment costs. Missing product costs can
                overstate profit. Refund amounts and quantities are shown as positive deductions (source signs
                reversed); reversals stay negative. Refunds are associated with orders processed in this range, not the
                dates refunds were issued.
              </p>
            </Disclosure>
            {options.ranking !== "value" && (
              <p className="text-sm text-muted-foreground">
                Gainers and decliners rank absolute changes against the first comparison period, using the same
                valid-order line population. Missing comparison values sort last. Changes remain hidden when comparison
                coverage is insufficient.
              </p>
            )}
            {options.entity && (
              <p className="text-sm">All totals below are scoped to the selected {options.dimension} identity.</p>
            )}
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${options.dimension}|${options.metric}|${options.entity}|${options.ranking}|${plan?.slots[0].mode}|${plan?.slots[1].mode}|${channel}`}
              fallback={<LoadingState variant="chart" label="Loading products" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() => getProducts({ ...filters, ...options, channel }, planRanges(plan))}
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
                        "higher",
                        label,
                      ),
                    );
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
                        valueLabel={metricLabel}
                        description={
                          options.ranking === "value"
                            ? "Top 10 by the selected measure. Shares and headline totals include all matching products. Shares are unavailable for zero totals or negative values."
                            : `Top 10 ${options.ranking} by absolute change in the selected measure vs ${plan?.slots[0].label ?? "the first comparison"}. Shares and headline totals use the same full scoped population; a missing comparison is not zero.`
                        }
                        hasMore={data.hasMore}
                        comparisonLabel={compare && baseline ? `Change vs ${baseline.label}` : undefined}
                        rows={data.rows.map((row) => ({
                          id: row.product_key,
                          label: `${row.label} (${row.reference})`,
                          chartLabel: row.label,
                          leading: <ProductPhoto images={images} productKey={row.product_key} />,
                          href: productHref(row.product_key),
                          value: {
                            value: decimalToNumber(row[options.metric]),
                            display: format(row[options.metric]),
                          },
                          share: formatPercent(
                            nonnegativeShare(row[options.metric], row[`total_${options.metric}`], row.minimum_value),
                          ),
                          change: compare
                            ? kpiDelta(row[options.metric], row[slotColumn(slot, options.metric)], format).display
                            : undefined,
                        }))}
                      />
                    );
                  };
                  const takeawayChanges = deltas(options.metric, format);
                  const takeaway = (slot: 0 | 1) => (
                    <ReportTakeaway
                      metric={metricLabel}
                      value={format(first?.[`total_${options.metric}`] ?? null)}
                      range={filters.range}
                      change={takeawayChanges[slot]}
                      issue={changes?.[slot].issue ?? plan?.slots[slot].note}
                    />
                  );
                  return (
                    <div className="flex flex-col gap-6">
                      {perSlot ? <ActiveBaseline a={takeaway(0)} b={takeaway(1)} /> : takeaway(0)}
                      {plan && (
                        <ComparisonCaption
                          compact
                          plan={plan}
                          issues={changes?.map((change) => change.issue)}
                          switchable={perSlot}
                        />
                      )}
                      <section aria-label="All product totals" className="grid gap-4 sm:grid-cols-2">
                        {PRODUCT_METRICS.slice(0, 2).map((item) => {
                          const formatValue = item.value === "units" ? formatMeasure : money;
                          return (
                            <KpiCard
                              key={item.value}
                              label={item.label}
                              value={formatValue(first?.[`total_${item.value}`] ?? null)}
                              period="All matching products in the selected period"
                              deltas={deltas(item.value, formatValue)}
                            />
                          );
                        })}
                      </section>
                      <ProductGallery
                        measure={metricLabel}
                        products={data.rows.map((row) => ({
                          key: row.product_key,
                          label: `${row.label} (${row.reference})`,
                          href: productHref(row.product_key),
                          image: <ProductPhoto images={images} productKey={row.product_key} className="size-20" />,
                          value: format(row[options.metric]),
                        }))}
                      />
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
                      ) : perSlot ? (
                        <ActiveBaseline a={ranking(0)} b={ranking(1)} />
                      ) : (
                        ranking(0)
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
