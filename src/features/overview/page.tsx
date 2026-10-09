import { OVERVIEW_RELATION } from "./rows";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { buildChartData } from "@/components/charts/chart-data";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { KpiCard } from "@/components/patterns/kpi-card";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { cardGridStyles } from "@/components/ui/card";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { comparisonDates, type Comparison } from "@/lib/comparison";
import { ReportPage } from "@/components/shell/report-page";
import { parseSalesChannel, withParams, datesInRange, rangeLength, type SearchParams } from "@/lib/filters";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { formatCount, formatDate, formatDay, formatMeasure, formatMoney, formatMultiple } from "@/lib/format";
import { getOverviewReport, type OverviewDay, type OverviewFilters, type OverviewReport } from "./queries";
import { parseTimeGrain } from "@/lib/time-grain";
import { OverviewControls } from "./controls";
import { OverviewSummary } from "./summary";
import { OverviewPurchases } from "./purchases";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const channel = parseSalesChannel(params);
  const grain = parseTimeGrain(params);
  return (
    <ReportPage
      sources={[
        {
          relation: OVERVIEW_RELATION,
          scope: "Daily summary rows, aggregated over the selected sales channels and dates.",
        },
      ]}
      title="Overview"
      description="Executive Summary metrics for one store, with an explicit sales-channel scope."
      pathname="/overview"
      params={params}
      agentFilters={{ sales_channel: channel, grain }}
      comparisons
    >
      {({ filters, comparison }) => {
        const selected: OverviewFilters = { ...filters, channel, grain };
        return (
          <>
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${grain}`}
              fallback={<LoadingState variant="control" label="Loading sales channels" />}
            >
              <OverviewControls filters={selected} />
            </Suspense>
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${comparison?.mode}|${channel}|${grain}`}
              fallback={<LoadingState variant="kpis" label="Loading the overview" />}
            >
              <DataRegion
                load={() => getOverviewReport(selected, comparison?.range ?? null)}
                isEmpty={(report) => report.current.days.length === 0}
                emptyMessage="No rows match this store, sales channel, and date range."
              >
                {(report) => <OverviewView report={report} filters={selected} comparison={comparison} />}
              </DataRegion>
            </Suspense>
          </>
        );
      }}
    </ReportPage>
  );
}

function OverviewView({
  report,
  filters,
  comparison,
}: {
  report: OverviewReport;
  filters: OverviewFilters;
  comparison?: Comparison;
}) {
  const data = report.current;
  const previous = report.comparison?.data?.totals ?? null;
  const baseline = comparison?.range;
  const showDelta = Boolean(baseline && !report.comparison?.error);
  const previousRevenue = decimalToNumber(previous?.netRevenue ?? null);
  const previousSpend = decimalToNumber(previous?.adSpend ?? null);
  const period = `${formatDate(filters.range.from)} – ${formatDate(filters.range.to)}`;
  const byDate = new Map(data.days.map((day) => [day.date, day]));
  // Every date in the range, so a date with no rows is a gap in the line, not a zero.
  const dates = datesInRange(filters.range);
  const dailyTableHref =
    filters.grain === "day"
      ? "#summary-heading"
      : `${withParams("/overview", {}, { store: filters.storeId, ...filters.range, sales_channel: filters.channel ?? null, compare: comparison?.mode ?? null, grain: "day" })}#summary-heading`;
  function trend(read: (day: OverviewDay) => string | number | bigint | null) {
    return {
      tableHref: dailyTableHref,
      values: dates.map((date) => {
        const day = byDate.get(date);
        const value = day ? read(day) : null;
        return typeof value === "string" ? decimalToNumber(value) : value;
      }),
    };
  }
  const aligned = comparison ? comparisonDates(filters.range, comparison) : [];
  const prior = new Map(report.comparison?.data?.days.map((day) => [day.date, day]));
  const baselineSeries = (key: string) =>
    showDelta ? [{ key: `previous_${key}`, label: "Comparison", color: "var(--chart-2)", dashed: true }] : [];
  function previousPoint(index: number, measure: "netRevenue" | "orders") {
    const date = aligned[index];
    const row = date ? prior.get(date) : undefined;
    const value = row?.[measure] ?? null;
    return {
      value: typeof value === "string" ? decimalToNumber(value) : value,
      display: `${row ? (measure === "netRevenue" ? formatMoney(value) : formatMeasure(value as number | null)) : "No rows"}${date ? ` (${formatDate(date)})` : " (no matching calendar day)"}`,
    };
  }
  const revenue = buildChartData(
    dates.map((date, index) => {
      const day = byDate.get(date);
      const value = decimalToNumber(day?.netRevenue ?? null);
      return {
        label: formatDay(date),
        values: {
          revenue: { value, display: day ? formatMoney(day.netRevenue) : "No rows" },
          ...(showDelta ? { previous_revenue: previousPoint(index, "netRevenue") } : {}),
        },
      };
    }),
  );
  const orders = buildChartData(
    dates.map((date, index) => {
      const day = byDate.get(date);
      return {
        label: formatDay(date),
        values: {
          orders: { value: day?.orders ?? null, display: day ? formatMeasure(day.orders) : "No rows" },
          ...(showDelta ? { previous_orders: previousPoint(index, "orders") } : {}),
        },
      };
    }),
  );
  const totals = data.totals;
  const netRevenue = decimalToNumber(totals?.netRevenue ?? null);
  const adSpend = decimalToNumber(totals?.adSpend ?? null);

  return (
    <div className="flex flex-col gap-6">
      {baseline && comparison && (
        <ComparisonCaption comparison={comparison}>
          <p>
            {rangeLength(filters.range)} selected days vs {rangeLength(baseline)} comparison days.
          </p>
          {report.comparison?.data && (
            <p>
              Days with rows: {data.days.length}/{rangeLength(filters.range)} selected;{" "}
              {report.comparison.data.days.length}/{rangeLength(baseline)} comparison. Missing days are not zeros; a day
              with rows can still be incomplete.
            </p>
          )}
          {comparison?.mode === "year" && (
            <p>
              Calendar dates, not matched weekdays. Period boundaries use Feb 28 when needed; unmatched leap days are
              gaps in comparison lines.
            </p>
          )}
        </ComparisonCaption>
      )}
      {report.comparison?.data &&
        (data.days.length < rangeLength(filters.range) ||
          (baseline && report.comparison.data.days.length < rangeLength(baseline))) && (
          <p className="text-sm text-muted-foreground">
            Some dates have no rows. Compare period totals with care; missing days are not zeros.
          </p>
        )}
      {comparison && comparison.mode !== "off" && !baseline && (
        <p>Comparison unavailable: the earlier period is outside supported warehouse dates.</p>
      )}
      {report.comparison?.error && (
        <ErrorState
          title={`Comparison unavailable: ${report.comparison.error.title}`}
          remedy={report.comparison.error.remedy}
          detail={report.comparison.error.detail}
        />
      )}
      <section aria-label="Period totals" className={cardGridStyles}>
        <KpiCard
          label="Net revenue"
          description="Gross order revenue minus discounts and refunds, summed across the selected sales channels for this store and period. Amounts use the warehouse's reporting currency."
          value={formatMoney(totals?.netRevenue ?? null)}
          trend={trend((day) => day.netRevenue)}
          delta={
            showDelta
              ? kpiDelta(totals?.netRevenue ?? null, previous?.netRevenue ?? null, formatMoney, "higher")
              : undefined
          }
          period={period}
        />
        <KpiCard
          label="Summary orders"
          description="Published order counts summed across the selected sales channels, including excluded, draft, and exchanged orders. This can differ from the number of valid orders."
          value={formatMeasure(totals?.orders ?? null)}
          trend={trend((day) => day.orders)}
          delta={
            showDelta ? kpiDelta(totals?.orders ?? null, previous?.orders ?? null, formatMeasure, "higher") : undefined
          }
          period={period}
        />
        <KpiCard
          label="Revenue per summary order"
          description="Net revenue divided by Summary orders for the same store and period. It uses the published summary count, so it can differ from average revenue per valid order."
          value={formatMoney(ratio(netRevenue, totals?.orders ?? null))}
          trend={trend((day) => ratio(decimalToNumber(day.netRevenue), day.orders))}
          delta={
            showDelta
              ? kpiDelta(
                  ratio(netRevenue, totals?.orders ?? null),
                  ratio(previousRevenue, previous?.orders ?? null),
                  formatMoney,
                )
              : undefined
          }
          period={period}
        />
        <KpiCard
          label="Ad spend"
          description="Published advertising spend summed across the selected sales channels for this store and period, in the warehouse's reporting currency."
          value={formatMoney(totals?.adSpend ?? null)}
          trend={trend((day) => day.adSpend)}
          delta={showDelta ? kpiDelta(totals?.adSpend ?? null, previous?.adSpend ?? null, formatMoney) : undefined}
          period={period}
        />
        <KpiCard
          label="Marketing efficiency (MER)"
          description="Net revenue divided by ad spend for the same store and period. This is a blended revenue-to-spend ratio, not ad-platform attributed ROAS."
          value={formatMultiple(ratio(netRevenue, adSpend))}
          trend={trend((day) => ratio(decimalToNumber(day.netRevenue), decimalToNumber(day.adSpend)))}
          delta={
            showDelta
              ? kpiDelta(ratio(netRevenue, adSpend), ratio(previousRevenue, previousSpend), formatMultiple, "higher")
              : undefined
          }
          period={period}
        />
        <KpiCard
          label="Website sessions"
          description="Published website session counts summed across the selected sales channels for this store and period. Sessions are visits, not unique people."
          value={formatCount(totals?.sessions ?? null)}
          trend={trend((day) => day.sessions)}
          delta={
            showDelta
              ? kpiDelta(totals?.sessions ?? null, previous?.sessions ?? null, formatCount, "higher")
              : undefined
          }
          period={period}
        />
      </section>
      <OverviewPurchases
        current={data.purchases}
        previous={report.comparison?.data?.purchases ?? null}
        comparedTo={showDelta && baseline ? `${formatDate(baseline.from)} – ${formatDate(baseline.to)}` : undefined}
      />
      <section aria-label="Daily trends" className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Net revenue by day"
          description={
            showDelta
              ? "Selected period and dashed comparison. Comparison dates appear in the table and tooltip."
              : "Selected period"
          }
          kind="line"
          categoryHeader="Date"
          series={[{ key: "revenue", label: "Net revenue", color: "var(--chart-1)" }, ...baselineSeries("revenue")]}
          data={revenue.data}
          plottable={revenue.plottable}
        />
        <ChartCard
          title="Summary orders by day"
          description={
            showDelta
              ? "Selected period and dashed comparison. Comparison dates appear in the table and tooltip."
              : "Selected period"
          }
          kind="line"
          categoryHeader="Date"
          series={[{ key: "orders", label: "Summary orders", color: "var(--chart-1)" }, ...baselineSeries("orders")]}
          data={orders.data}
          plottable={orders.plottable}
        />
      </section>
      <OverviewSummary data={data} filters={filters} />
    </div>
  );
}
