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
import { KpiCard, type KpiDelta } from "@/components/patterns/kpi-card";
import { ComparisonCaption } from "@/components/patterns/comparison-caption";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { kpiDelta, slotDeltas } from "@/components/patterns/kpi-delta";
import { planParams, planRanges, slotChanges, type ComparisonPlan } from "@/lib/comparison";
import { ReportPage } from "@/components/shell/report-page";
import {
  parseChoice,
  salesChannelLabel,
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
import { getOverviewReport, overviewSlice, type OverviewFilters, type OverviewReport } from "./queries";
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
const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

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
      clientPresentationParams={["show_trends"]}
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
      description="Executive Summary metrics for one store, with an explicit sales-channel scope."
      pathname="/overview"
      params={{ ...params, sales_channel: channel ?? "" }}
      agentFilters={{ sales_channel: channel, grain, trend: trendMode }}
      comparisons
    >
      {({ filters, plan, timeZone, currency, dataStatus, params: applied }) => {
        const selected: OverviewFilters = { ...filters, channel, grain };
        const comparisonParams = planParams(plan);
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
                    plan={plan}
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
                    ...comparisonParams,
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
                        ...comparisonParams,
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
  plan,
  currency,
  trendMode,
  timeZone,
}: {
  timeZone: string;
  report: OverviewReport;
  filters: OverviewFilters;
  plan?: ComparisonPlan;
  currency: string | null;
  trendMode: (typeof TREND_MODES)[number]["value"];
}) {
  const data = report.current;
  const changes = plan ? slotChanges(plan, report.coverage) : null;
  const period = formatDateRange(filters.range);
  const presentedDays = new Map(data.days.map((day) => [day.date, presentOverviewMeasures(day, currency)]));
  const currentMeasures = presentOverviewMeasures(data.totals, currency);
  const baselineMeasures = report.baselines.map((entry) =>
    presentOverviewMeasures(entry?.data?.totals ?? null, currency),
  );
  // Every date in the range, so a date with no rows is a gap in the line, not a zero.
  const dates = datesInRange(filters.range);
  const dailyTableHref =
    filters.grain === "day"
      ? "#summary-heading"
      : `${withParams("/overview", {}, { store: filters.storeId, ...filters.range, sales_channel: filters.channel ?? "", ...planParams(plan), grain: "day" })}#summary-heading`;
  function trend(key: OverviewMeasureKey) {
    return {
      tableHref: dailyTableHref,
      values: dates.map((date) => {
        const amount = presentedDays.get(date)?.[key].amount ?? null;
        return typeof amount === "string" ? decimalToNumber(amount) : amount;
      }),
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
              label,
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
        "Published order counts on the valid sales channels within the selected scope. Draft, exchanged and excluded rows are not sales, and this published measure can still differ from the number of valid orders.",
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

  /**
   * Everything that reads one comparison slot: the headline, the chart
   * overlay, the biggest changes and the detail tables. Both slots are
   * rendered and the caption's switch shows one, so switching makes no request.
   */
  const slotView = (slot: 0 | 1) => {
    const baseline = plan?.slots[slot];
    const slice = overviewSlice(report, slot);
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
    const headline = overviewHeadline(slice, filters, baseline, currency);
    return {
      note:
        showDelta &&
        compared &&
        (data.days.length < rangeLength(filters.range) || (range && compared.days.length < rangeLength(range))) ? (
          <p className="text-sm text-muted-foreground">
            Some dates have no rows. Compare period totals with care; missing days are not zeros.
          </p>
        ) : null,
      headline: headline ? (
        <p
          data-agent-target="Summary"
          data-agent-component="Headline"
          className="max-w-prose font-display text-lg leading-snug text-balance sm:text-xl"
        >
          {headline}
        </p>
      ) : null,
      charts: (
        <OverviewTrendSelector
          param="metric"
          kind="line"
          categoryHeader="Date"
          titleSuffix={trendMode === "cumulative" ? "to date" : "by day"}
          description={
            showLines
              ? `Selected period and dashed comparison (${baseline?.label ?? "comparison"}). Comparison dates appear in the table and tooltip.`
              : "Selected period"
          }
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
                      label: capitalize(baseline?.label ?? "comparison"),
                      color: "var(--chart-2)",
                      dashed: true,
                    },
                  ]
                : []),
            ],
          }))}
        />
      ),
      highlights: <OverviewHighlights report={slice} filters={filters} comparison={baseline} currency={currency} />,
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

  return (
    <div className="flex flex-col gap-6">
      <section aria-label="Period totals" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards
          .filter((card) => ["revenue", "orders", "spend", "mer"].includes(card.key))
          .map((card) => {
            const current = currentMeasures[card.key];
            return (
              <KpiCard
                key={card.key}
                label={card.label}
                description={card.description}
                binding={overviewBindings.find((binding) => binding.id === card.key)}
                scope={scope}
                value={compactHeadline(
                  current.amount,
                  current.display,
                  overviewBindings.find((binding) => binding.id === card.key)?.format ?? "number",
                  currency,
                )}
                fullValue={current.display}
                trend={trend(card.key)}
                deltas={deltas(card.key)}
                period={period}
              />
            );
          })}
      </section>
      {/* Comparison coverage sits right under the primary metrics, so results stay above the fold. */}
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
      {pick("headline")}
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
        {pick("charts")}
      </section>
      {pick("highlights")}
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
                  scope={scope}
                  trend={trend(card.key)}
                  deltas={deltas(card.key)}
                />
              ))}
          </section>
          {pick("purchases")}
        </div>
      </Disclosure>
      {pick("revenue")}
      <Disclosure summary="Business summary and CSV" id="summary-details">
        <OverviewSummary data={data} filters={filters} currency={currency} timeZone={timeZone} />
      </Disclosure>
    </div>
  );
}
