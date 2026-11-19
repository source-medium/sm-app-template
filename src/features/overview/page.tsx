import { overviewBindings } from "./metrics";
import { OVERVIEW_RELATION } from "./rows";
import { appConfig } from "@/app.config";
import Link from "next/link";
import type { Metadata } from "next";
import { Suspense } from "react";
import { OverviewReportBody } from "./report-body";
import { ReportAnchor, type ReportHref } from "@/components/patterns/report-anchor";
import { OverviewTrendSelector } from "./trend-selector";
import { Disclosure } from "@/components/ui/disclosure";
import { DataRegion } from "@/components/patterns/data-region";
import { ErrorState, LoadingState } from "@/components/patterns/data-states";
import { KpiCard, type KpiDelta } from "@/components/patterns/kpi-card";
import type { KpiTrendData } from "@/components/charts/kpi-trend";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { kpiDelta, slotDeltas } from "@/components/patterns/kpi-delta";
import { comparisonDates, planParams, planRanges, slotChanges, type ComparisonPlan } from "@/lib/comparison";
import { ReportPage } from "@/components/shell/report-page";
import {
  parseChoice,
  salesChannelLabel,
  withParams,
  datesInRange,
  rangeLength,
  type ReportDates,
  type SearchParams,
} from "@/lib/filters";
import { MetricDefinition } from "@/components/patterns/metric-definition";
import { compactHeadline, formatDateRange } from "@/lib/format";
import { presentOverviewMeasures, type OverviewMeasureKey } from "./measures";
import { getOverviewReport, overviewSlice, type OverviewFilters, type OverviewReport } from "./queries";
import { overviewOptions, SHOW_TRENDS_PARAM } from "./filters";
import { OverviewControls } from "./controls";
import { OverviewSummary } from "./summary";
import { OverviewRevenue } from "./revenue";
import { OverviewPurchases } from "./purchases";
import { revenueContributions } from "./contributions";
import { ChannelChanges, OverviewHighlights } from "./highlights";
import { SelectFilter } from "@/components/patterns/select-filter";
import { overviewTrends, SPARKLINE_DAILY_DAYS, sparklineValues, TREND_MODES } from "./trends";
import { ReportControls } from "@/components/shell/report-controls";

export const metadata: Metadata = { title: "Overview" };
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

export default async function OverviewPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const { channel, grain } = overviewOptions(params);
  const trendMode = parseChoice(
    params,
    "trend",
    TREND_MODES.map((mode) => mode.value),
    "daily",
  );
  return (
    <ReportPage
      dataStatusAfterControls
      clientPresentationParams={[SHOW_TRENDS_PARAM]}
      chartParams={["metric"]}
      bindings={overviewBindings}
      maxDays={appConfig.summaryMaxDays}
      sources={[
        {
          relation: OVERVIEW_RELATION,
          scope:
            "Daily summary rows, aggregated over the selected sales channels and dates. Revenue and order measures count valid sales channels; spend and traffic count every row.",
        },
      ]}
      title="Overview"
      description="How the store is doing across sales, orders, ad spend and efficiency."
      pathname="/overview"
      params={{ ...params, sales_channel: channel ?? "" }}
      agentFilters={{ sales_channel: channel, grain, trend: trendMode }}
      comparisons
    >
      {({ filters, plan, timeZone, currency, dataStatus, params: applied, dates }) => {
        const selected: OverviewFilters = { ...filters, channel, grain };
        const comparisonParams = planParams(plan);
        return (
          <>
            <ReportControls
              summary={[salesChannelLabel(channel), TREND_MODES.find((mode) => mode.value === trendMode)?.label]}
            >
              <OverviewControls filters={selected} />
              <SelectFilter name="trend" label="Trend values" value={trendMode} options={[...TREND_MODES]} />
            </ReportControls>
            {dataStatus}
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${comparisonParams.compare}|${comparisonParams.compare2}|${channel}|${grain}`}
              fallback={<LoadingState variant="kpis" label="Loading the overview" />}
            >
              <DataRegion
                timestamp={timeZone}
                load={() => getOverviewReport(selected, planRanges(plan))}
                isEmpty={(report) => report.current.days.length === 0}
                emptyMessage="No rows match this store, sales channel, and date range."
                emptyAction={
                  channel
                    ? {
                        href: withParams("/overview", applied, { sales_channel: "" }),
                        label: "Show all sales channels",
                      }
                    : undefined
                }
              >
                {(report) => (
                  <OverviewView
                    report={report}
                    filters={selected}
                    params={applied}
                    dateParams={dates}
                    plan={plan}
                    currency={currency}
                    trendMode={trendMode}
                    timeZone={timeZone}
                    contextHref={withParams(
                      "/overview/export.json",
                      {},
                      {
                        store: filters.storeId,
                        ...dates.fixed,
                        sales_channel: channel ?? "",
                        grain,
                        ...comparisonParams,
                      },
                    )}
                  />
                )}
              </DataRegion>
            </Suspense>
            {appConfig.nav.some((item) => item.href === "/geography") && (
              <p className="text-sm text-muted-foreground">
                <Link
                  prefetch={false}
                  className="font-medium text-foreground underline underline-offset-4"
                  href={withParams(
                    "/geography",
                    {},
                    {
                      store: filters.storeId,
                      ...dates.live,
                      sales_channel: channel ?? "",
                      ...comparisonParams,
                      date_basis: "processed",
                    },
                  )}
                >
                  Explore sales by geography
                </Link>
                . It counts valid orders by processed date, so its totals can differ from these.
              </p>
            )}
          </>
        );
      }}
    </ReportPage>
  );
}

function OverviewView({
  report,
  filters,
  dateParams,
  params,
  plan,
  currency,
  trendMode,
  timeZone,
  contextHref,
}: {
  timeZone: string;
  /** The JSON export of this exact report. */
  contextHref: string;
  report: OverviewReport;
  filters: OverviewFilters;
  dateParams: ReportDates;
  params: SearchParams;
  plan?: ComparisonPlan;
  currency: string | null;
  trendMode: (typeof TREND_MODES)[number]["value"];
}) {
  const data = report.current;
  const changes = plan ? slotChanges(plan, report.coverage) : null;
  const dayByDate = new Map(data.days.map((day) => [day.date, day]));
  const currentMeasures = presentOverviewMeasures(data.totals, currency);
  const baselineMeasures = report.baselines.map((entry) =>
    presentOverviewMeasures(entry?.data?.totals ?? null, currency),
  );
  // Every date in the range, so a date with no rows is a gap in the line, not a zero.
  const dates = datesInRange(filters.range);
  const dailyTableHref: ReportHref =
    filters.grain === "day"
      ? "#summary-heading"
      : { query: { store: filters.storeId, grain: "day" }, fragment: "summary-heading" };
  // Each comparison's days lined up with the selected dates the way the main chart lines them up.
  const selectedDays = dates.map((date) => dayByDate.get(date));
  const comparisonDays = (plan?.slots ?? []).map((slot, index) => {
    const days = report.baselines[index]?.data?.days;
    if (!slot.range || !days) return null;
    const byDate = new Map(days.map((day) => [day.date, day]));
    return {
      label: slot.short,
      days: comparisonDates(filters.range, slot).map((date) => (date ? byDate.get(date) : undefined)),
    };
  });
  function trend(key: OverviewMeasureKey): KpiTrendData {
    return {
      tableHref: dailyTableHref,
      grain: dates.length > SPARKLINE_DAILY_DAYS ? "week" : "day",
      values: sparklineValues(selectedDays, key, currency),
      comparisons: plan
        ? comparisonDays.map((slot) =>
            slot ? { label: slot.label, values: sparklineValues(slot.days, key, currency) } : null,
          )
        : undefined,
    };
  }
  /** One row per comparison slot: the change when coverage allows it, otherwise why not. */
  function deltas(key: OverviewMeasureKey): KpiDelta[] {
    const current = currentMeasures[key];
    return slotDeltas(
      plan,
      changes,
      (label, slot) =>
        report.baselines[slot]?.data
          ? kpiDelta(
              current.amount,
              baselineMeasures[slot]?.[key].amount ?? null,
              current.format,
              current.better,
              plan ? `vs ${plan.slots[slot].label}` : label,
            )
          : null,
      (slot) => {
        const error = report.baselines[slot]?.error;
        return error ? `Unavailable: ${error.title}` : undefined;
      },
    );
  }
  const scope = {
    filters: { store: filters.storeId, ...filters.range, sales_channel: filters.channel ?? null },
    currency,
    timeZone,
  };
  const cards: Record<OverviewMeasureKey, { label: string; description: string }> = {
    revenue: {
      label: "Net revenue",
      description:
        "Published net order revenue across the selected sales channels for this store and period. See Revenue and deductions for the signed components and any unreconciled difference. Amounts use the warehouse's reporting currency.",
    },
    orders: {
      label: "Orders",
      description:
        "Published order counts on the valid sales channels within the selected scope. Draft, exchanged and excluded rows are not sales.",
    },
    average: {
      label: "Revenue per order",
      description:
        "Net revenue divided by Orders for the same store and period. It uses the published summary count, so it can differ from average revenue per valid order.",
    },
    spend: {
      label: "Ad spend",
      description:
        "Published advertising spend summed across the selected sales channels for this store and period, in the warehouse's reporting currency. It comes from the daily summary, so it can differ by cents from Paid marketing, which sums ad-level rows.",
    },
    mer: {
      label: "Marketing efficiency (MER)",
      description:
        "Net revenue divided by ad spend for the same store and period. This is a blended revenue-to-spend ratio, not ad-platform attributed ROAS.",
    },
    sessions: {
      label: "Website sessions",
      description:
        "Published website session counts summed across the selected sales channels for this store and period. Sessions are visits, not unique people.",
    },
  };

  /**
   * Everything that reads one comparison slot: the chart overlay, the biggest
   * changes and the detail tables. Both slots are rendered and the caption's
   * switch shows one, so switching makes no request.
   */
  const slotView = (slot: 0 | 1) => {
    const baseline = plan?.slots[slot];
    const slice = overviewSlice(report, slot);
    const contributions = revenueContributions(slice, filters, baseline);
    const compared = slice.comparison?.data ?? null;
    const range = baseline?.range;
    const showDelta = changes?.[slot]?.show ?? false;
    // Daily lines align date by date, so they still show; period totals change only when coverage allows.
    const showLines = Boolean(range && compared);
    const charts = overviewTrends(
      data.days,
      filters.range,
      trendMode,
      currency,
      showLines && baseline && compared ? { period: baseline, days: compared.days } : undefined,
    );
    return {
      note:
        showDelta &&
        compared &&
        (data.days.length < rangeLength(filters.range) || (range && compared.days.length < rangeLength(range))) ? (
          <p className="text-sm text-muted-foreground">
            Some dates have no rows. Compare period totals with care; missing days are not zeros.
          </p>
        ) : null,
      charts: (
        <OverviewTrendSelector
          param="metric"
          kind="line"
          categoryHeader="Date"
          titleSuffix={trendMode === "cumulative" ? "to date" : "by day"}
          metrics={charts.map((chart) => ({
            ...chart,
            definition: (
              <MetricDefinition
                binding={overviewBindings.find((binding) => binding.id === chart.key) ?? overviewBindings[0]}
                scope={scope}
              />
            ),
            series: [
              { key: chart.key, label: chart.label, color: "var(--chart-1)" },
              ...(showLines
                ? [
                    {
                      key: `previous_${chart.key}`,
                      label: capitalize(baseline?.short ?? "comparison"),
                      color: "var(--chart-2)",
                      dashed: true,
                    },
                  ]
                : []),
            ],
          }))}
        />
      ),
      channels: baseline && (
        <ChannelChanges
          contributions={contributions}
          currency={currency}
          baseline={baseline}
          params={{ ...params, baseline: slot === 1 ? "b" : undefined, [SHOW_TRENDS_PARAM]: undefined }}
        />
      ),
      highlights: (
        <OverviewHighlights
          contributions={contributions}
          report={slice}
          filters={filters}
          comparison={baseline}
          currency={currency}
        />
      ),
      purchases: (
        <OverviewPurchases
          current={data.purchases}
          previous={compared?.purchases ?? null}
          comparedTo={showDelta && range ? formatDateRange(range) : undefined}
          currency={currency}
        />
      ),
      revenue: (
        <OverviewRevenue
          current={data.revenue}
          previous={compared?.revenue ?? null}
          compare={showDelta}
          currency={currency}
        />
      ),
    };
  };
  const views = [slotView(0), slotView(1)] as const;
  const pick = (key: keyof (typeof views)[0]) =>
    plan ? <ActiveBaseline a={views[0][key]} b={views[1][key]} /> : views[0][key];

  function metricCard(key: OverviewMeasureKey) {
    const card = cards[key];
    const secondary = key === "average" || key === "sessions";
    const current = currentMeasures[key];
    const binding = overviewBindings.find((binding) => binding.id === key);
    const comparisons = deltas(key);
    return (
      <KpiCard
        key={key}
        label={card.label}
        description={card.description}
        binding={binding}
        scope={scope}
        value={
          secondary
            ? current.display
            : compactHeadline(current.amount, current.display, binding?.format ?? "number", currency)
        }
        trend={secondary ? trend(key) : undefined}
        compact={key === "orders" || key === "spend" || key === "mer"}
        fullValue={current.display}
        deltas={key === "revenue" ? comparisons.map((row) => ({ ...row, short: undefined })) : comparisons}
      >
        {key === "revenue" ? pick("channels") : undefined}
      </KpiCard>
    );
  }

  return (
    <OverviewReportBody>
      {/* The switch picks the comparison every chart and table uses, KPI sparklines included; KPI cards show both changes as numbers. */}
      {plan && (
        <ComparisonCaption plan={plan} issues={changes?.map((change) => change.issue)}>
          <p>
            {rangeLength(filters.range)} selected days
            {plan.slots
              .filter((slot) => slot.range)
              .map((slot) => ` vs ${rangeLength(slot.range ?? filters.range)} days (${slot.label})`)
              .join("")}
            .
          </p>
          {report.baselines.map((entry, index) =>
            entry?.data ? (
              <p key={index}>
                Days with rows ({plan.slots[index]?.label}): {data.days.length}/{rangeLength(filters.range)} selected;{" "}
                {entry.data.days.length}/{rangeLength(plan.slots[index]?.range ?? filters.range)} comparison. Missing
                days are not zeros; a day with rows can still be incomplete.
              </p>
            ) : null,
          )}
          {plan.slots.some((slot) => slot.mode === "year" && slot.range) && (
            <p>
              Last year compares calendar dates, not matched weekdays. Period boundaries use Feb 28 when needed;
              unmatched leap days are gaps in comparison lines.
            </p>
          )}
        </ComparisonCaption>
      )}
      {pick("note")}
      <section aria-label="Period totals" className="flex flex-col gap-3">
        {metricCard("revenue")}
        <div className="grid gap-px overflow-clip rounded-xl border bg-border shadow-card sm:grid-cols-3">
          {metricCard("orders")}
          {metricCard("spend")}
          {metricCard("mer")}
        </div>
      </section>
      {report.baselines.map((entry, index) =>
        entry?.error ? (
          <ErrorState
            key={index}
            title={`Comparison unavailable (${plan?.slots[index]?.label ?? "comparison"}): ${entry.error.title}`}
            remedy={entry.error.remedy}
            detail={entry.error.detail}
            requestId={entry.error.requestId}
          />
        ) : null,
      )}
      <section id="performance-trends" aria-label="Performance trends" className="flex flex-col gap-3">
        {filters.channel && <h2 className="font-semibold wrap-anywhere">{salesChannelLabel(filters.channel)}</h2>}
        {trendMode === "cumulative" && (
          <p className="max-w-prose text-sm text-muted-foreground">
            Each line starts at its own period&apos;s first day. A missing date or measure stops its cumulative line;
            missing values are never treated as zeros. KPI cards and the business summary remain period totals.
          </p>
        )}
        {pick("charts")}
        <ReportAnchor
          className="w-fit text-sm text-muted-foreground underline underline-offset-4"
          href={dailyTableHref}
        >
          Open daily business summary
        </ReportAnchor>
      </section>
      {pick("highlights")}
      {/* More of the report, folded: set apart from the sections above so it never reads as their notes. */}
      <div className="flex flex-col gap-1 border-t pt-3">
        <Disclosure summary="More metrics">
          <div className="space-y-6">
            <section aria-label="Secondary metrics" className="grid gap-4 sm:grid-cols-2">
              {metricCard("average")}
              {metricCard("sessions")}
            </section>
            {pick("purchases")}
          </div>
        </Disclosure>
        {pick("revenue")}
        <Disclosure summary="Daily summary and downloads" id="summary-details">
          <OverviewSummary
            data={data}
            filters={filters}
            dates={dateParams.fixed}
            currency={currency}
            timeZone={timeZone}
          />
          <a className="mt-3 inline-block text-sm underline underline-offset-4" href={contextHref}>
            Download JSON with context
          </a>
        </Disclosure>
      </div>
    </OverviewReportBody>
  );
}
