import { appConfig } from "@/app.config";
import { geographyOptions } from "./filters";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ReportPage } from "@/components/shell/report-page";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { SelectFilter } from "@/components/patterns/select-filter";
import { KpiCard } from "@/components/patterns/kpi-card";
import { DataTable } from "@/components/patterns/data-table";
import { ChartCard } from "@/components/charts/chart-card";
import { ComparisonCaption, ComparisonIssue } from "@/components/patterns/comparison-caption";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { Disclosure } from "@/components/ui/disclosure";
import { formatCount, formatDate, formatMoneyIn, formatPercent } from "@/lib/format";
import { decimalToNumber } from "@/lib/data/decimal";
import { periodChanges } from "@/lib/comparison";
import { drillDown } from "@/lib/drill-down";
import { REPORT_FILTER_FORM_ID, datesInRange, withParams, type SearchParams } from "@/lib/filters";
import { UNKNOWN_LOCATION, US_STATES } from "@/lib/shipping-geography";
import { orderDateLabel } from "@/lib/order-scope";
import countryNames from "./assets/countries-codes.json";
import stateNames from "./assets/us-states-codes.json";
import { getGeography } from "./queries";
import { GEOGRAPHY_RELATION, geographicReconciliation } from "./rows";
import { geographyBindings } from "./metrics";
import { GeographyMap } from "./map";

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
      description="Where are valid-order sales happening, and which shipping destinations are changing?"
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
      agentFilters={{ date_basis: dateBasis, population: "valid", country, region, sales_channel: channel }}
      defaults={() => ({ date_basis: dateBasis })}
    >
      {({ filters, comparison, currency, timeZone, params: applied, dataStatus }) => {
        const baseline = comparison?.range ?? null;
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
          ...filters.range,
          dateBasis,
          population: "valid",
          comparison: comparison?.mode,
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
        const selectedOrders = drillDown({ ...context, comparison: "off" }, destination);
        return (
          <>
            <div className="flex flex-wrap items-end gap-3">
              <SelectFilter
                name="date_basis"
                label="Date basis"
                value={dateBasis}
                options={[
                  { value: "processed", label: "Processed, fallback to created" },
                  { value: "created", label: "Created" },
                ]}
              />
              {country && <input name="country" type="hidden" value={country} form={REPORT_FILTER_FORM_ID} />}
              {region && <input name="region" type="hidden" value={region} form={REPORT_FILTER_FORM_ID} />}
              {channel && <input name="sales_channel" type="hidden" value={channel} form={REPORT_FILTER_FORM_ID} />}
              {country && (
                <Link
                  prefetch={false}
                  className="py-2 text-sm underline"
                  href={withParams("/geography", applied, { country: null, region: null })}
                >
                  All countries
                </Link>
              )}
              {region && (
                <Link
                  prefetch={false}
                  className="py-2 text-sm underline"
                  href={withParams("/geography", applied, { region: null })}
                >
                  All regions in {country}
                </Link>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {orderDateLabel(dateBasis)}. Valid orders only.{" "}
              {country ? `Shipping: ${country}${region ? ` / ${region}` : ""}.` : "All shipping countries."}{" "}
              {channel && `Sales channel: ${channel}.`} Shipping destinations describe where orders were sent, not
              residence or advertising reach.
            </p>
            {dataStatus}
            <Link
              prefetch={false}
              className="text-sm underline"
              href={withParams("/geography/export", {}, { ...scope.filters, population: null })}
            >
              Download geographic sales CSV
            </Link>
            {comparison && <ComparisonCaption comparison={comparison} />}
            {issue ? (
              <ErrorState title="Check geographic scope" remedy={issue} tone="warning" />
            ) : (
              <Suspense
                key={JSON.stringify([filters, dateBasis, country, region, channel, baseline])}
                fallback={<LoadingState variant="chart" label="Loading geographic sales" />}
              >
                <DataRegion
                  timestamp={timeZone}
                  load={() => getGeography({ ...filters, dateBasis, country, region, channel }, baseline)}
                  isEmpty={(data) => data.total.records === 0n}
                  emptyMessage="No valid orders match these dates and shipping filters."
                  emptyAction={{
                    href: withParams("/geography", applied, { country: null, region: null }),
                    label: "Show all destinations",
                  }}
                >
                  {(data) => {
                    const { show: compare, issue: comparisonIssue } = periodChanges(
                      filters.range,
                      baseline,
                      data.total,
                    );
                    const reconciled = geographicReconciliation(data);
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
                    return (
                      <div className="space-y-6">
                        <ComparisonIssue issue={comparisonIssue} />
                        {!reconciled && (
                          <ErrorState
                            title="Geographic totals disagree"
                            remedy="The independently queried total does not match all destination groups. Coverage and changes require maintainer review."
                          />
                        )}
                        <section aria-label="Geographic sales totals" className="grid gap-4 sm:grid-cols-3">
                          <KpiCard
                            label="Valid-order net revenue"
                            value={money(data.total.revenue)}
                            period="Selected shipping population"
                            binding={bindings[0]}
                            scope={scope}
                            delta={
                              compare && reconciled
                                ? kpiDelta(data.total.revenue, data.total.previous_revenue, money)
                                : undefined
                            }
                          />
                          <KpiCard
                            label="Valid orders"
                            value={formatCount(data.total.orders)}
                            period="Selected shipping population"
                            binding={bindings[1]}
                            scope={scope}
                            delta={
                              compare && reconciled
                                ? kpiDelta(String(data.total.orders), String(data.total.previous_orders), (value) =>
                                    formatCount(value === null ? null : BigInt(value)),
                                  )
                                : undefined
                            }
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
                              country && country !== "US"
                                ? "Region boundaries unavailable for this country"
                                : "Same selected population as the total"
                            }
                            description="Orders assigned to a bundled boundary divided by the independently queried valid-order count. Unknown, unmapped and remainder orders remain in the denominator. This measures boundary coverage, not data completeness."
                          />
                        </section>
                        <div className="grid min-w-0 gap-5 lg:grid-cols-2">
                          <section className="min-w-0 lg:order-2" aria-label="Ranked shipping destinations">
                            <DataTable
                              caption={country ? `Shipping regions in ${country}` : "Shipping countries"}
                              pageSize={15}
                              columns={[
                                { key: "location", header: "Shipping destination" },
                                { key: "orders", header: "Valid orders", align: "right", sortable: false },
                                { key: "revenue", header: "Net revenue", align: "right", sortable: false },
                                ...(compare && reconciled
                                  ? [
                                      {
                                        key: "change",
                                        header: "Revenue change",
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
                                  change: { display: kpiDelta(row.revenue, row.previous_revenue, money).display },
                                },
                              }))}
                              totals={{
                                id: "total",
                                cells: {
                                  location: { display: "Independent total" },
                                  orders: { display: formatCount(data.total.orders) },
                                  revenue: { display: money(data.total.revenue) },
                                },
                              }}
                            />
                            <p className="mt-3 text-sm text-muted-foreground">
                              All groups, including unknown, unmapped and any remainder,{" "}
                              {reconciled ? "reconcile to the independent total" : "have an unreconciled difference"}.
                              Table pagination does not change totals.{" "}
                              {data.groups.some((row) => row.kind === "remainder") &&
                                "The first 500 destinations are listed individually; all others are combined in the remainder."}
                            </p>
                          </section>
                          {!country || country === "US" ? (
                            <div className="min-w-0 lg:order-1">
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
                            <p className="text-sm text-muted-foreground">
                              Region maps are currently available for U.S. states. This country’s regions are available
                              in the table.
                            </p>
                          )}
                        </div>
                        <ChartCard
                          title={`${region ? label(region) : (country ?? "All destinations")}: valid-order net revenue`}
                          description="Selected shipping population by local date. Dates without matching orders remain gaps; missing revenue is not zero."
                          categoryHeader="Date"
                          kind="line"
                          series={[{ key: "revenue", label: "Net revenue", color: "var(--chart-1)" }]}
                          data={datesInRange(filters.range).map((date) => ({
                            label: formatDate(date),
                            revenue: decimalToNumber(trends.get(date)?.revenue ?? null),
                            revenue__display: money(trends.get(date)?.revenue ?? null),
                          }))}
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
