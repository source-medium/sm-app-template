import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { buildChartData } from "@/components/charts/chart-data";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { KpiCard } from "@/components/patterns/kpi-card";
import { ReportPage } from "@/components/shell/report-page";
import { datesInRange, type ReportFilters, type SearchParams } from "@/lib/filters";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { formatCount, formatDate, formatDay, formatMeasure, formatMoney, formatMultiple } from "@/lib/format";
import { getOverview, type OverviewData } from "./queries";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <ReportPage
      title="Overview"
      description="Executive Summary metrics across all channels, by day for one store."
      pathname="/overview"
      params={params}
    >
      {({ filters }) => (
        <Suspense
          key={`${filters.storeId}|${filters.range.from}|${filters.range.to}`}
          fallback={<LoadingState variant="kpis" label="Loading the overview" />}
        >
          <DataRegion
            load={() => getOverview(filters)}
            isEmpty={(data) => data.days.length === 0}
            emptyMessage="This store has no rows in the selected dates."
          >
            {(data) => <OverviewView data={data} filters={filters} />}
          </DataRegion>
        </Suspense>
      )}
    </ReportPage>
  );
}

function OverviewView({ data, filters }: { data: OverviewData; filters: ReportFilters }) {
  const period = `${formatDate(filters.range.from)} – ${formatDate(filters.range.to)}`;
  const byDate = new Map(data.days.map((day) => [day.date, day]));
  // Every date in the range, so a date with no rows is a gap in the line, not a zero.
  const dates = datesInRange(filters.range);
  const revenue = buildChartData(
    dates.map((date) => {
      const day = byDate.get(date);
      const value = decimalToNumber(day?.netRevenue ?? null);
      return {
        label: formatDay(date),
        values: { revenue: { value, display: day ? formatMoney(day.netRevenue) : "No rows" } },
      };
    }),
  );
  const orders = buildChartData(
    dates.map((date) => {
      const day = byDate.get(date);
      return {
        label: formatDay(date),
        values: { orders: { value: day?.orders ?? null, display: day ? formatMeasure(day.orders) : "No rows" } },
      };
    }),
  );
  const totals = data.totals;
  const netRevenue = decimalToNumber(totals?.netRevenue ?? null);
  const adSpend = decimalToNumber(totals?.adSpend ?? null);

  return (
    <div className="flex flex-col gap-6">
      <p className="text-sm text-muted-foreground">
        Summary orders sum every channel, including excluded, draft, and exchanged orders when published. They can
        differ from valid-order counts. Revenue per summary order uses this same count.
      </p>
      <section aria-label="Period totals" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <KpiCard
          label="Net revenue"
          description="Gross order revenue minus discounts and refunds, summed across all channels for this store and period. Amounts use the warehouse's reporting currency."
          value={formatMoney(totals?.netRevenue ?? null)}
          period={period}
        />
        <KpiCard
          label="Summary orders"
          description="Published order counts summed across every channel, including excluded, draft, and exchanged orders. This can differ from the number of valid orders."
          value={formatMeasure(totals?.orders ?? null)}
          period={period}
        />
        <KpiCard
          label="Revenue per summary order"
          description="Net revenue divided by Summary orders for the same store and period. It uses the all-channel summary count, so it can differ from average revenue per valid order."
          value={formatMoney(ratio(netRevenue, totals?.orders ?? null))}
          period={period}
        />
        <KpiCard
          label="Ad spend"
          description="Published advertising spend summed across all channels for this store and period, in the warehouse's reporting currency."
          value={formatMoney(totals?.adSpend ?? null)}
          period={period}
        />
        <KpiCard
          label="Marketing efficiency (MER)"
          description="Net revenue divided by ad spend for the same store and period. This is a blended revenue-to-spend ratio, not ad-platform attributed ROAS."
          value={formatMultiple(ratio(netRevenue, adSpend))}
          period={period}
        />
        <KpiCard
          label="Website sessions"
          description="Published website session counts summed across all channels for this store and period. Sessions are visits, not unique people."
          value={formatCount(totals?.sessions ?? null)}
          period={period}
        />
      </section>
      <section aria-label="Daily trends" className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Net revenue by day"
          kind="line"
          categoryHeader="Date"
          series={[{ key: "revenue", label: "Net revenue", color: "var(--chart-1)" }]}
          data={revenue.data}
          plottable={revenue.plottable}
        />
        <ChartCard
          title="Summary orders by day"
          kind="line"
          categoryHeader="Date"
          series={[{ key: "orders", label: "Summary orders", color: "var(--chart-1)" }]}
          data={orders.data}
          plottable={orders.plottable}
        />
      </section>
    </div>
  );
}
