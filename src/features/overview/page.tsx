import { OVERVIEW_RELATION } from "./rows";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { KpiCard } from "@/components/patterns/kpi-card";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { cardGridStyles } from "@/components/ui/card";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { periodChanges, type Comparison } from "@/lib/comparison";
import { ReportPage } from "@/components/shell/report-page";
import {
  parseChoice,
  parseSalesChannel,
  withParams,
  datesInRange,
  rangeLength,
  type SearchParams,
} from "@/lib/filters";
import { decimalToNumber } from "@/lib/data/decimal";
import { formatDate } from "@/lib/format";
import { presentOverviewMeasures, type OverviewMeasureKey } from "./measures";
import { getOverviewReport, type OverviewFilters, type OverviewReport } from "./queries";
import { parseTimeGrain } from "@/lib/time-grain";
import { OverviewControls } from "./controls";
import { OverviewSummary } from "./summary";
import { OverviewRevenue } from "./revenue";
import { OverviewPurchases } from "./purchases";
import { OverviewHighlights } from "./highlights";
import { SelectFilter } from "@/components/patterns/select-filter";
import { overviewTrends, TREND_MODES } from "./trends";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const channel = parseSalesChannel(params);
  const grain = parseTimeGrain(params);
  const trendMode = parseChoice(
    params,
    "trend",
    TREND_MODES.map((mode) => mode.value),
    "daily",
  );
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
      agentFilters={{ sales_channel: channel, grain, trend: trendMode }}
      comparisons
    >
      {({ filters, comparison, timeZone, currency }) => {
        const selected: OverviewFilters = { ...filters, channel, grain };
        return (
          <>
            <div className="flex flex-wrap items-end gap-4">
              <OverviewControls filters={selected} />
              <SelectFilter name="trend" label="Trend values" value={trendMode} options={[...TREND_MODES]} />
            </div>
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${comparison?.mode}|${channel}|${grain}`}
              fallback={<LoadingState variant="kpis" label="Loading the overview" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() => getOverviewReport(selected, comparison?.range ?? null)}
                isEmpty={(report) => report.current.days.length === 0}
                emptyMessage="No rows match this store, sales channel, and date range."
              >
                {(report) => (
                  <OverviewView
                    report={report}
                    filters={selected}
                    comparison={comparison}
                    currency={currency}
                    trendMode={trendMode}
                  />
                )}
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
  currency,
  trendMode,
}: {
  report: OverviewReport;
  filters: OverviewFilters;
  comparison?: Comparison;
  currency: string | null;
  trendMode: (typeof TREND_MODES)[number]["value"];
}) {
  const data = report.current;
  const compared = report.comparison?.data ?? null;
  const baseline = comparison?.range;
  const { show: showDelta, issue } = periodChanges(filters.range, baseline, report.coverage);
  // Daily lines align date by date, so they still show; period totals change only when coverage allows.
  const showLines = Boolean(baseline && compared);
  const period = `${formatDate(filters.range.from)} – ${formatDate(filters.range.to)}`;
  const presentedDays = new Map(data.days.map((day) => [day.date, presentOverviewMeasures(day, currency)]));
  const currentMeasures = presentOverviewMeasures(data.totals, currency);
  const previousMeasures = presentOverviewMeasures(compared?.totals ?? null, currency);
  // Every date in the range, so a date with no rows is a gap in the line, not a zero.
  const dates = datesInRange(filters.range);
  const dailyTableHref =
    filters.grain === "day"
      ? "#summary-heading"
      : `${withParams("/overview", {}, { store: filters.storeId, ...filters.range, sales_channel: filters.channel ?? null, compare: comparison?.mode ?? null, grain: "day" })}#summary-heading`;
  function trend(key: OverviewMeasureKey) {
    return {
      tableHref: dailyTableHref,
      values: dates.map((date) => {
        const amount = presentedDays.get(date)?.[key].amount ?? null;
        return typeof amount === "string" ? decimalToNumber(amount) : amount;
      }),
    };
  }
  const charts = overviewTrends(
    data.days,
    filters.range,
    trendMode,
    currency,
    showLines && comparison && compared ? { period: comparison, days: compared.days } : undefined,
  );
  const cards: { key: OverviewMeasureKey; label: string; description: string }[] = [
    {
      key: "revenue",
      label: "Net revenue",
      description:
        "Published net order revenue across the selected sales channels for this store and period. See Revenue and deductions for the signed components and any unreconciled difference. Amounts use the warehouse's reporting currency.",
    },
    {
      key: "orders",
      label: "Summary orders",
      description:
        "Published order counts summed across the selected sales channels, including excluded, draft, and exchanged orders. This can differ from the number of valid orders.",
    },
    {
      key: "average",
      label: "Revenue per summary order",
      description:
        "Net revenue divided by Summary orders for the same store and period. It uses the published summary count, so it can differ from average revenue per valid order.",
    },
    {
      key: "spend",
      label: "Ad spend",
      description:
        "Published advertising spend summed across the selected sales channels for this store and period, in the warehouse's reporting currency. It comes from the daily summary, so it can differ by cents from Paid marketing, which sums ad-level rows.",
    },
    {
      key: "mer",
      label: "Marketing efficiency (MER)",
      description:
        "Net revenue divided by ad spend for the same store and period. This is a blended revenue-to-spend ratio, not ad-platform attributed ROAS.",
    },
    {
      key: "sessions",
      label: "Website sessions",
      description:
        "Published website session counts summed across the selected sales channels for this store and period. Sessions are visits, not unique people.",
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      {baseline && comparison && (
        <ComparisonCaption comparison={comparison} issue={issue}>
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
      {showDelta &&
        report.comparison?.data &&
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
        {cards.map((card) => {
          const current = currentMeasures[card.key];
          const previous = previousMeasures[card.key];
          return (
            <KpiCard
              key={card.key}
              label={card.label}
              description={card.description}
              value={current.display}
              trend={trend(card.key)}
              delta={showDelta ? kpiDelta(current.amount, previous.amount, current.format, current.better) : undefined}
              period={period}
            />
          );
        })}
      </section>
      <OverviewHighlights report={report} filters={filters} comparison={comparison} currency={currency} />
      <OverviewRevenue
        current={data.revenue}
        previous={compared?.revenue ?? null}
        compare={showDelta}
        currency={currency}
      />
      <OverviewPurchases
        current={data.purchases}
        previous={report.comparison?.data?.purchases ?? null}
        comparedTo={showDelta && baseline ? `${formatDate(baseline.from)} – ${formatDate(baseline.to)}` : undefined}
        currency={currency}
      />
      <section aria-labelledby="trends-heading" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h2 id="trends-heading" className="text-lg font-semibold">
            Performance trends
          </h2>
        </div>
        {trendMode === "cumulative" && (
          <p className="max-w-prose text-sm text-muted-foreground">
            Each line starts at its own period's first day. A missing date or measure stops its cumulative line; missing
            values are never treated as zeros. KPI cards and the business summary remain period totals.
          </p>
        )}
        <div className="grid gap-4 lg:grid-cols-2 2xl:grid-cols-3">
          {charts.map((chart) => (
            <ChartCard
              key={chart.key}
              title={chart.title}
              description={
                showLines
                  ? "Selected period and dashed comparison. Comparison dates appear in the table and tooltip."
                  : "Selected period"
              }
              kind="line"
              categoryHeader="Date"
              series={[
                { key: chart.key, label: chart.label, color: "var(--chart-1)" },
                ...(showLines
                  ? [{ key: `previous_${chart.key}`, label: "Comparison", color: "var(--chart-2)", dashed: true }]
                  : []),
              ]}
              data={chart.data}
              plottable={chart.plottable}
            />
          ))}
        </div>
      </section>
      <OverviewSummary data={data} filters={filters} currency={currency} />
    </div>
  );
}
