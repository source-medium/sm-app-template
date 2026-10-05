import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { buildChartData } from "@/components/charts/chart-data";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { KpiCard } from "@/components/patterns/kpi-card";
import { ReportPage } from "@/components/shell/report-page";
import { datesInRange, type ReportFilters, type SearchParams } from "@/lib/filters";
import { formatCount, formatDate, formatDay, formatMeasure } from "@/lib/format";
import { getOverview, type OverviewData } from "./queries";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  return (
    <ReportPage
      title="Overview"
      description="Orders, website sessions, and ad clicks by day for one store."
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
  const orders = buildChartData(
    dates.map((date) => {
      const day = byDate.get(date);
      return {
        label: formatDay(date),
        values: { orders: { value: day?.orders ?? null, display: day ? formatMeasure(day.orders) : "No rows" } },
      };
    }),
  );
  const sessions = buildChartData(
    dates.map((date) => {
      const day = byDate.get(date);
      return {
        label: formatDay(date),
        values: { sessions: { value: day?.sessions ?? null, display: day ? formatCount(day.sessions) : "No rows" } },
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Period totals" className="grid gap-4 sm:grid-cols-3">
        <KpiCard label="Orders" value={formatMeasure(data.totals?.orders ?? null)} period={period} />
        <KpiCard label="Website sessions" value={formatCount(data.totals?.sessions ?? null)} period={period} />
        <KpiCard label="Ad clicks" value={formatCount(data.totals?.adClicks ?? null)} period={period} />
      </section>
      <section aria-label="Daily trends" className="grid gap-4 lg:grid-cols-2">
        <ChartCard
          title="Orders by day"
          kind="line"
          categoryHeader="Date"
          series={[{ key: "orders", label: "Orders", color: "var(--chart-1)" }]}
          data={orders.data}
          plottable={orders.plottable}
        />
        <ChartCard
          title="Website sessions by day"
          kind="line"
          categoryHeader="Date"
          series={[{ key: "sessions", label: "Website sessions", color: "var(--chart-1)" }]}
          data={sessions.data}
          plottable={sessions.plottable}
        />
      </section>
    </div>
  );
}
