import { overviewBindings } from "./metrics";
import { OVERVIEW_RELATION } from "./rows";
import { appConfig } from "@/app.config";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { OverviewTrendSelector } from "./trend-selector";
import { Disclosure } from "@/components/ui/disclosure";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { KpiCard } from "@/components/patterns/kpi-card";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { kpiDelta } from "@/components/patterns/kpi-delta";
import { periodChanges, type Comparison } from "@/lib/comparison";
import { ReportPage } from "@/components/shell/report-page";
import {
  parseChoice,
  salesChannelLabel,
  salesChannelReset,
  summarySalesChannel,
  withParams,
  datesInRange,
  rangeLength,
  type SearchParams,
} from "@/lib/filters";
import { decimalToNumber } from "@/lib/data/decimal";
import { MetricDefinition } from "@/components/patterns/metric-definition";
import { compactHeadline, formatDateRange } from "@/lib/format";
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
import { SectionHeader } from "@/components/patterns/section-header";
import { overviewHeadline } from "./headline";
import { ReportControls } from "@/components/shell/report-controls";

export const metadata: Metadata = { title: "Overview" };

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const channel = summarySalesChannel(params);
  const grain = parseTimeGrain(params);
  const trendMode = parseChoice(
    params,
    "trend",
    TREND_MODES.map((mode) => mode.value),
    "daily",
  );
  return (
    <ReportPage
      dataStatusAfterControls
      clientPresentationParams={["metric", "show_trends"]}
      bindings={overviewBindings}
      maxDays={appConfig.summaryMaxDays}
      sources={[
        {
          relation: OVERVIEW_RELATION,
          scope: "Daily summary rows, aggregated over the selected sales channels and dates.",
        },
      ]}
      title="Overview"
      description="Executive Summary metrics for one store, with an explicit sales-channel scope."
      pathname="/overview"
      params={{ ...params, sales_channel: channel ?? "" }}
      agentFilters={{ sales_channel: channel, grain, trend: trendMode }}
      comparisons
    >
      {({ filters, comparison, timeZone, currency, dataStatus }) => {
        const selected: OverviewFilters = { ...filters, channel, grain };
        return (
          <>
            <ReportControls
              summary={`${salesChannelLabel(channel)}. ${TREND_MODES.find((mode) => mode.value === trendMode)?.label}.`}
            >
              <OverviewControls filters={selected} />
              <SelectFilter name="trend" label="Trend values" value={trendMode} options={[...TREND_MODES]} />
            </ReportControls>
            {dataStatus}
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${comparison?.mode}|${channel}|${grain}`}
              fallback={<LoadingState variant="kpis" label="Loading the overview" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() => getOverviewReport(selected, comparison?.range ?? null)}
                isEmpty={(report) => report.current.days.length === 0}
                emptyMessage="No rows match this store, sales channel, and date range."
                emptyAction={salesChannelReset("/overview", params, channel)}
              >
                {(report) => (
                  <OverviewView
                    report={report}
                    filters={selected}
                    comparison={comparison}
                    currency={currency}
                    trendMode={trendMode}
                    timeZone={timeZone}
                  />
                )}
              </DataRegion>
            </Suspense>
            <div className="flex flex-wrap gap-4 text-sm">
              <a
                className="underline"
                href={withParams(
                  "/overview/export.json",
                  {},
                  {
                    store: filters.storeId,
                    ...filters.range,
                    sales_channel: channel ?? "",
                    grain,
                    compare: comparison?.mode ?? "off",
                  },
                )}
              >
                Download JSON with context
              </a>
              {appConfig.nav.some((item) => item.href === "/geography") && (
                <Disclosure summary="Explore sales by geography">
                  <p className="mb-2 max-w-prose text-muted-foreground">
                    Geography uses valid-order sales and the canonical processed date with a created-date fallback.
                    Executive Summary uses published summary totals and its own date basis. This transition preserves
                    store, dates and sales channels but changes the population; geography does not reconcile summary
                    revenue.
                  </p>
                  <Link
                    prefetch={false}
                    className="underline"
                    href={withParams(
                      "/geography",
                      {},
                      {
                        store: filters.storeId,
                        ...filters.range,
                        sales_channel: channel ?? "",
                        compare: comparison?.mode ?? "off",
                        date_basis: "processed",
                      },
                    )}
                  >
                    Open valid-order geography
                  </Link>
                </Disclosure>
              )}
            </div>
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
  timeZone,
}: {
  timeZone: string;
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
  const period = formatDateRange(filters.range);
  const headline = overviewHeadline(report, filters, comparison, currency);
  const presentedDays = new Map(data.days.map((day) => [day.date, presentOverviewMeasures(day, currency)]));
  const currentMeasures = presentOverviewMeasures(data.totals, currency);
  const previousMeasures = presentOverviewMeasures(compared?.totals ?? null, currency);
  // Every date in the range, so a date with no rows is a gap in the line, not a zero.
  const dates = datesInRange(filters.range);
  const dailyTableHref =
    filters.grain === "day"
      ? "#summary-heading"
      : `${withParams("/overview", {}, { store: filters.storeId, ...filters.range, sales_channel: filters.channel ?? "", compare: comparison?.mode ?? null, grain: "day" })}#summary-heading`;
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
      {/* Keep comparison coverage beside the primary metrics. */}
      <div className="flex flex-col gap-2">
        {baseline && comparison && (
          <ComparisonCaption comparison={comparison} issue={issue}>
            <p>
              {rangeLength(filters.range)} selected days vs {rangeLength(baseline)} comparison days.
            </p>
            {report.comparison?.data && (
              <p>
                Days with rows: {data.days.length}/{rangeLength(filters.range)} selected;{" "}
                {report.comparison.data.days.length}/{rangeLength(baseline)} comparison. Missing days are not zeros; a
                day with rows can still be incomplete.
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
      </div>
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
      <section aria-label="Period totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards
          .filter((card) => ["revenue", "orders", "spend", "mer"].includes(card.key))
          .map((card) => {
            const current = currentMeasures[card.key];
            const previous = previousMeasures[card.key];
            return (
              <KpiCard
                key={card.key}
                label={card.label}
                description={card.description}
                binding={overviewBindings.find((binding) => binding.id === card.key)}
                scope={{
                  filters: { store: filters.storeId, ...filters.range, sales_channel: filters.channel ?? null },
                  currency,
                  timeZone,
                }}
                value={compactHeadline(
                  current.amount,
                  current.display,
                  overviewBindings.find((binding) => binding.id === card.key)?.format ?? "number",
                  currency,
                )}
                fullValue={current.display}
                trend={trend(card.key)}
                delta={
                  showDelta ? kpiDelta(current.amount, previous.amount, current.format, current.better) : undefined
                }
                period={period}
              />
            );
          })}
      </section>
      {headline && (
        <p
          data-agent-target="Summary"
          data-agent-component="Headline"
          className="max-w-prose font-display text-lg leading-snug text-balance sm:text-xl"
        >
          {headline}
        </p>
      )}
      <section aria-labelledby="trends-heading" className="flex flex-col gap-3">
        <SectionHeader
          id="trends-heading"
          title="Performance trends"
          description={
            trendMode === "cumulative"
              ? "Each line starts at its own period's first day. A missing date or measure stops its cumulative line; missing values are never treated as zeros. KPI cards and the business summary remain period totals."
              : undefined
          }
        />
        <OverviewTrendSelector
          charts={charts.map((chart) => ({
            ...chart,
            definition: (
              <MetricDefinition
                binding={overviewBindings.find((binding) => binding.id === chart.key) ?? overviewBindings[0]}
                scope={{
                  filters: { store: filters.storeId, ...filters.range, sales_channel: filters.channel ?? null },
                  currency,
                  timeZone,
                }}
              />
            ),
            kind: "line",
            categoryHeader: "Date",
            description: showLines
              ? "Selected period and dashed comparison. Comparison dates appear in the table and tooltip."
              : "Selected period",
            series: [
              { key: chart.key, label: chart.label, color: "var(--chart-1)" },
              ...(showLines
                ? [{ key: `previous_${chart.key}`, label: "Comparison", color: "var(--chart-2)", dashed: true }]
                : []),
            ],
          }))}
        />
      </section>
      <OverviewHighlights report={report} filters={filters} comparison={comparison} currency={currency} />
      <Disclosure summary="Secondary metrics and business details">
        <div className="space-y-6">
          <section aria-label="Secondary metrics" className="grid gap-4 sm:grid-cols-2">
            {cards
              .filter((card) => ["average", "sessions"].includes(card.key))
              .map((card) => (
                <KpiCard
                  key={card.key}
                  label={card.label}
                  value={currentMeasures[card.key].display}
                  period={period}
                  description={card.description}
                  binding={overviewBindings.find((binding) => binding.id === card.key)}
                  scope={{
                    filters: { store: filters.storeId, ...filters.range, sales_channel: filters.channel ?? null },
                    currency,
                    timeZone,
                  }}
                  trend={trend(card.key)}
                  delta={
                    showDelta
                      ? kpiDelta(
                          currentMeasures[card.key].amount,
                          previousMeasures[card.key].amount,
                          currentMeasures[card.key].format,
                          currentMeasures[card.key].better,
                        )
                      : undefined
                  }
                />
              ))}
          </section>
          <OverviewPurchases
            current={data.purchases}
            previous={compared?.purchases ?? null}
            comparedTo={showDelta && baseline ? formatDateRange(baseline) : undefined}
            currency={currency}
          />
        </div>
      </Disclosure>
      <OverviewRevenue
        current={data.revenue}
        previous={compared?.revenue ?? null}
        compare={showDelta}
        currency={currency}
      />
      <Disclosure summary="Business summary and CSV" id="summary-details">
        <OverviewSummary data={data} filters={filters} currency={currency} timeZone={timeZone} />
      </Disclosure>
    </div>
  );
}
