import { appConfig } from "@/app.config";
import { geographyOptions } from "./filters";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ReportControls } from "@/components/shell/report-controls";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { SelectFilter } from "@/components/patterns/select-filter";
import { KpiCard, type KpiDelta } from "@/components/patterns/kpi-card";
import { DataTable } from "@/components/patterns/data-table";
import { MetricChart } from "@/components/charts/metric-chart";
import { buildChartData, type PointValue } from "@/components/charts/chart-data";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { kpiDelta, slotDeltas } from "@/components/patterns/kpi-delta";
import { slotColumn } from "@/lib/data/period-sql";
import { Disclosure } from "@/components/ui/disclosure";
import { formatCount, formatDate, formatMoneyIn, formatPercent } from "@/lib/format";
import { decimalToNumber } from "@/lib/data/decimal";
import { planRanges, slotChanges } from "@/lib/comparison";
import { drillDown } from "@/lib/drill-down";
import { REPORT_FILTER_FORM_ID, datesInRange, salesChannelLabel, withParams, type SearchParams } from "@/lib/filters";
import { UNKNOWN_LOCATION, US_STATES } from "@/lib/shipping-geography";
import { orderDateLabel } from "@/lib/order-scope";
import countryNames from "./assets/countries-codes.json";
import stateNames from "./assets/us-states-codes.json";
import { getGeography } from "./queries";
import { GEOGRAPHY_RELATION, geographicReconciliation, type GeographyRow } from "./rows";
import { geographyBindings } from "./metrics";
import { GeographyMap } from "./map";
import { SectionHeader } from "@/components/patterns/section-header";

export const metadata: Metadata = { title: "Sales by geography" };
export default async function GeographyPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { dateBasis, country, region, channel, issue } = geographyOptions(params);
  const bindings = geographyBindings(dateBasis);
  const mappedCodes: Readonly<Record<string, string>> = country === "US" ? stateNames : country ? {} : countryNames;
  return (
    <ReportPage
      dataStatusAfterControls
      title="Sales by geography"
      description="Where orders ship, and which destinations are changing."
      pathname="/geography"
      params={params}
      comparisons
      sources={[
        {
          relation: GEOGRAPHY_RELATION,
          scope: `Valid orders by shipping destination; ${orderDateLabel(dateBasis)}; selected sales channels.`,
        },
      ]}
      bindings={bindings}
      chartParams={["metric"]}
      agentFilters={{ date_basis: dateBasis, population: "valid", country, region, sales_channel: channel }}
      defaults={() => ({ date_basis: dateBasis })}
    >
      {({ filters, dates, plan, currency, timeZone, params: applied, dataStatus }) => {
        const scope = {
          filters: {
            store: filters.storeId,
            ...filters.range,
            date_basis: dateBasis,
            population: "valid",
            country,
            region,
            sales_channel: channel,
          },
          currency,
          timeZone,
        };
        const money = formatMoneyIn(currency);
        const context = {
          store: filters.storeId,
          dates: dates.live,
          dateBasis,
          population: "valid",
          comparison: plan?.slots[0].mode,
          comparison2: plan?.slots[1].mode,
          filters: { country, region, sales_channel: channel },
        };
        const destination = {
          pathname: "/orders",
          dateBasis,
          population: "valid",
          filters: { country: "country", region: "region", sales_channel: "sales_channel" },
          required: { date_basis: dateBasis, population: "valid" },
        };
        const orders = drillDown(context, destination);
        const selectedOrders = drillDown({ ...context, comparison: "off", comparison2: "off" }, destination);
        return (
          <>
            <ReportControls
              summary={[
                country ? `Shipping to ${country}${region ? ` / ${region}` : ""}` : "All shipping countries",
                orderDateLabel(dateBasis),
                channel && salesChannelLabel(channel),
              ]}
            >
              <SelectFilter
                name="date_basis"
                label="Date basis"
                value={dateBasis}
                options={[
                  { value: "processed", label: "Processed, fallback to created" },
                  { value: "created", label: "Created" },
                ]}
              />
            </ReportControls>
            {country && <input name="country" type="hidden" value={country} form={REPORT_FILTER_FORM_ID} />}
            {region && <input name="region" type="hidden" value={region} form={REPORT_FILTER_FORM_ID} />}
            {channel && <input name="sales_channel" type="hidden" value={channel} form={REPORT_FILTER_FORM_ID} />}
            {country && (
              <nav aria-label="Shipping destination" className="flex flex-wrap items-center gap-3">
                <Link
                  prefetch={false}
                  className="py-2 text-sm underline"
                  href={withParams("/geography", applied, { country: null, region: null })}
                >
                  All countries
                </Link>
                {region && (
                  <Link
                    prefetch={false}
                    className="py-2 text-sm underline"
                    href={withParams("/geography", applied, { region: null })}
                  >
                    All regions in {country}
                  </Link>
                )}
              </nav>
            )}
            {dataStatus}
            {issue ? (
              <ErrorState title="Check geographic scope" remedy={issue} tone="warning" />
            ) : (
              <Suspense
                key={JSON.stringify([filters, dateBasis, country, region, channel, planRanges(plan)])}
                fallback={<LoadingState variant="chart" label="Loading geographic sales" />}
              >
                <DataRegion
                  timestamp={timeZone}
                  load={() => getGeography({ ...filters, dateBasis, country, region, channel }, planRanges(plan))}
                  isEmpty={(data) => data.total.records === 0n}
                  emptyMessage="No valid orders match these dates and shipping filters."
                  emptyAction={{
                    href: withParams("/geography", applied, { country: null, region: null }),
                    label: "Show all destinations",
                  }}
                >
                  {(data) => {
                    const changes = plan ? slotChanges(plan, data.total) : null;
                    const reconciled = geographicReconciliation(data);
                    const slotValue = (row: GeographyRow, slot: 0 | 1, measure: "revenue" | "orders") =>
                      measure === "revenue"
                        ? row[slotColumn(slot, "revenue")]
                        : String(row[slotColumn(slot, "orders")]);
                    /** Both comparison rows for a total, in slot order; unreconciled totals show no change. */
                    const deltas = (measure: "revenue" | "orders"): KpiDelta[] =>
                      slotDeltas(plan, changes, (label, slot) =>
                        !reconciled
                          ? null
                          : measure === "revenue"
                            ? kpiDelta(
                                data.total.revenue,
                                slotValue(data.total, slot, "revenue"),
                                money,
                                "neutral",
                                label,
                              )
                            : kpiDelta(
                                String(data.total.orders),
                                slotValue(data.total, slot, "orders"),
                                (value) => formatCount(value === null ? null : BigInt(value)),
                                "neutral",
                                label,
                              ),
                      );
                    const mappedOrders = data.groups
                      .filter((row) => row.kind !== "remainder" && mappedCodes[row.location])
                      .reduce((sum, row) => sum + row.orders, 0n);
                    const coverage =
                      data.total.orders === 0n ? null : Number((mappedOrders * 1000000n) / data.total.orders) / 1000000;
                    const maxOrders = data.groups.reduce((max, row) => (row.orders > max ? row.orders : max), 0n);
                    const label = (code: string) =>
                      code === UNKNOWN_LOCATION
                        ? "Unknown destination"
                        : code === "(other)"
                          ? "Other destinations (remainder)"
                          : (mappedCodes[code] ??
                            (country === "US" ? US_STATES[code] : undefined) ??
                            `${code}${!country || country === "US" ? " (unmapped)" : ""}`);
                    const link = (code: string) =>
                      code === "(other)"
                        ? undefined
                        : withParams(
                            "/geography",
                            applied,
                            country ? { region: code } : { country: code, region: null },
                          );
                    const trends = new Map(data.trend.map((row) => [row.date, row]));
                    /** One measure of the daily trend; a date without rows stays a gap. */
                    const trendMetric = (
                      key: string,
                      metricLabel: string,
                      point: (row: GeographyRow | undefined) => PointValue,
                    ) => ({
                      key,
                      label: metricLabel,
                      series: [{ key, label: metricLabel, color: "var(--chart-1)" }],
                      ...buildChartData(
                        datesInRange(filters.range).map((date) => ({
                          label: formatDate(date),
                          values: { [key]: point(trends.get(date)) },
                        })),
                      ),
                    });
                    /** The destination table for one comparison slot; both are rendered and the active one shows. */
                    const table = (slot: 0 | 1) => {
                      const baseline = plan?.slots[slot];
                      const compare = Boolean(changes?.[slot].show && baseline?.range && reconciled);
                      return (
                        <DataTable
                          caption={country ? `Shipping regions in ${country}` : "Shipping countries"}
                          pageSize={15}
                          columns={[
                            { key: "location", header: "Shipping destination" },
                            { key: "orders", header: "Valid orders", align: "right", sortable: false },
                            { key: "revenue", header: "Net revenue", align: "right", sortable: false },
                            ...(compare && baseline
                              ? [
                                  {
                                    key: "change",
                                    header: `Change vs ${baseline.label}`,
                                    align: "right" as const,
                                    sortable: false,
                                  },
                                ]
                              : []),
                          ]}
                          rows={data.groups.map((row) => ({
                            id: row.location,
                            cells: {
                              location: { display: label(row.location), href: link(row.location) },
                              orders: { display: formatCount(row.orders) },
                              revenue: { display: row.records === 0n ? "No matching records" : money(row.revenue) },
                              change: {
                                display: kpiDelta(row.revenue, slotValue(row, slot, "revenue"), money).display,
                              },
                            },
                          }))}
                          totals={{
                            id: "total",
                            cells: {
                              location: { display: "Total" },
                              orders: { display: formatCount(data.total.orders) },
                              revenue: { display: money(data.total.revenue) },
                            },
                          }}
                        />
                      );
                    };
                    return (
                      <div className="space-y-6">
                        {!reconciled && (
                          <ErrorState
                            title="Geographic totals disagree"
                            remedy="The independently queried total does not match all destination groups. Coverage and changes require maintainer review."
                          />
                        )}
                        <section aria-label="Geographic sales totals" className="grid gap-4 sm:grid-cols-3">
                          <KpiCard
                            label="Net revenue"
                            value={money(data.total.revenue)}
                            binding={bindings[0]}
                            scope={scope}
                            deltas={deltas("revenue")}
                          />
                          <KpiCard
                            label="Valid orders"
                            value={formatCount(data.total.orders)}
                            binding={bindings[1]}
                            scope={scope}
                            deltas={deltas("orders")}
                          />
                          <KpiCard
                            label="Mapped-order coverage"
                            value={
                              country && country !== "US"
                                ? "Not applicable"
                                : reconciled
                                  ? formatPercent(coverage)
                                  : "Unavailable"
                            }
                            period={
                              country && country !== "US" ? "Region boundaries unavailable for this country" : undefined
                            }
                            description="Orders assigned to a bundled boundary divided by the independently queried valid-order count. Unknown, unmapped and remainder orders remain in the denominator. This measures boundary coverage, not data completeness."
                          />
                        </section>
                        {plan && <ComparisonCaption plan={plan} issues={changes?.map((change) => change.issue)} />}
                        <section aria-labelledby="destinations-heading" className="flex min-w-0 flex-col gap-3">
                          <SectionHeader
                            id="destinations-heading"
                            title="Shipping destinations"
                            actions={
                              <Link
                                prefetch={false}
                                className={buttonVariants({ variant: "outline", size: "sm" })}
                                href={withParams("/geography/export", {}, { ...scope.filters, population: null })}
                              >
                                <Download aria-hidden /> Download CSV
                              </Link>
                            }
                          />
                          <div className="grid min-w-0 gap-5 lg:grid-cols-5">
                            <div className="flex min-w-0 flex-col gap-3 lg:order-2 lg:col-span-3">
                              {plan ? <ActiveBaseline a={table(0)} b={table(1)} /> : table(0)}
                            </div>
                            {!country || country === "US" ? (
                              <div className="min-w-0 lg:order-1 lg:col-span-2">
                                <GeographyMap
                                  country={country}
                                  locations={data.groups
                                    .filter((row) => row.kind !== "remainder")
                                    .map((row) => ({
                                      code: row.location,
                                      label: label(row.location),
                                      orders: formatCount(row.orders),
                                      href: link(row.location),
                                      intensity: maxOrders === 0n ? 0 : Number((row.orders * 1000n) / maxOrders) / 1000,
                                    }))}
                                />
                              </div>
                            ) : (
                              <p className="text-sm text-muted-foreground lg:col-span-2">
                                Region maps are currently available for U.S. states. This country’s regions are
                                available in the table.
                              </p>
                            )}
                          </div>
                        </section>
                        <MetricChart
                          param="metric"
                          titleSuffix={`by day in ${region ? label(region) : (country ?? "all destinations")}`}
                          categoryHeader="Date"
                          kind="line"
                          metrics={[
                            trendMetric("revenue", "Net revenue", (row) => ({
                              value: decimalToNumber(row?.revenue ?? null),
                              display: money(row?.revenue ?? null),
                            })),
                            trendMetric("orders", "Valid orders", (row) => ({
                              value: row?.orders ?? null,
                              display: formatCount(row?.orders ?? null),
                            })),
                          ]}
                        />
                        {appConfig.nav.some((item) => item.href === "/orders") &&
                          (orders.href ? (
                            <Link prefetch={false} className="underline" href={orders.href}>
                              Explore these orders
                            </Link>
                          ) : (
                            <Disclosure summary="Explore these orders">
                              <p className="mb-3 text-sm">
                                {orders.reasons.join(" ")} Orders will show the selected period with the same
                                valid-order population, date basis and shipping filters. Return to Geography for the
                                comparison.
                              </p>
                              {selectedOrders.href && (
                                <Link prefetch={false} className="underline" href={selectedOrders.href}>
                                  Open selected-period orders
                                </Link>
                              )}
                            </Disclosure>
                          ))}
                        <Disclosure summary="About these numbers" variant="note">
                          <div className="max-w-prose space-y-2">
                            <p>
                              Valid orders only. Shipping destinations describe where orders were sent, not residence or
                              advertising reach. Dates without matching orders remain gaps, not zeros.
                            </p>
                            <p>
                              All groups, including unknown, unmapped and any remainder,{" "}
                              {reconciled ? "reconcile to the independent total" : "have an unreconciled difference"}.
                              Table pagination does not change totals.{" "}
                              {data.groups.some((row) => row.kind === "remainder") &&
                                "The first 500 destinations are listed individually; all others are combined in the remainder."}
                            </p>
                          </div>
                        </Disclosure>
                      </div>
                    );
                  }}
                </DataRegion>
              </Suspense>
            )}
          </>
        );
      }}
    </ReportPage>
  );
}
