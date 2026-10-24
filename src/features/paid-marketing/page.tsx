import { drillDown } from "@/lib/drill-down";
import type { Metadata } from "next";
import { Suspense } from "react";
import { appConfig } from "@/app.config";
import { Download } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { ChartCard } from "@/components/charts/chart-card";
import { buildChartData, type PointValue } from "@/components/charts/chart-data";
import { DataRegion } from "@/components/patterns/data-region";
import { EmptyState, LoadingState } from "@/components/patterns/data-states";
import { DataTable } from "@/components/patterns/data-table";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { SelectFilter } from "@/components/patterns/select-filter";
import { AdNameFilter } from "@/components/patterns/ad-name-filter";
import { AdNameMatches } from "@/components/patterns/ad-name-matches";
import { parseAdNameFilters, serializeAdNameFilters } from "@/lib/ad-name-filters";
import { ReportPage } from "@/components/shell/report-page";
import { toChartNumber } from "@/lib/data/decode";
import { decimalToNumber } from "@/lib/data/decimal";
import { parseTimeGrain, periodStart, periodRange, TIME_GRAINS } from "@/lib/time-grain";
import { datesInRange, REPORT_FILTER_FORM_ID, parseChoice, withParams, type SearchParams } from "@/lib/filters";
import {
  EMPTY_VALUE,
  formatCount,
  formatDay,
  formatDateRange,
  formatMeasure,
  formatMoney,
  formatMoneyIn,
  formatMultiple,
  formatPercent,
} from "@/lib/format";
import { MAX_NAMED_CHANNELS, channelChart, type MetricValue } from "./chart";
import {
  PAID_METRICS,
  BREAKDOWN_DIMENSIONS,
  getSpendBreakdown,
  breakdownDimension,
  getPaidMarketing,
  getPaidNames,
  paidChannel,
  campaignRatios,
  type PaidMarketingData,
  type PaidMarketingFilters,
  type PaidMetric,
} from "./queries";
import { SpendBreakdownView } from "./breakdown";
import { AD_RELATION, MAX_CAMPAIGNS } from "./rows";
import { Disclosure } from "@/components/ui/disclosure";
import { SectionHeader } from "@/components/patterns/section-header";

export const metadata: Metadata = { title: "Paid marketing" };

const PATHNAME = "/paid-marketing";
const METRIC_LABELS: Record<PaidMetric, string> = {
  spend: "Spend",
  impressions: "Impressions",
  clicks: "Clicks",
  conversions: "Platform-reported conversions",
  revenue: "Platform-reported revenue",
  roas: "Platform ROAS",
  cpo: "Cost / conversion",
};

export default async function PaidMarketingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const metric = parseChoice(params, "metric", PAID_METRICS, "spend");
  const channel = paidChannel(params);
  const names = parseAdNameFilters(params);
  const nameKey = serializeAdNameFilters(names.rules);

  return (
    <ReportPage
      dataStatusAfterControls
      sources={[
        {
          relation: AD_RELATION,
          scope:
            "Daily ad delivery aggregated by channel, campaign, or the selected spend dimension. Conversions and revenue use ad-platform attribution.",
        },
      ]}
      title="Paid marketing"
      description="Spend and delivery by channel and campaign for one store."
      pathname={PATHNAME}
      params={params}
      agentFilters={{
        channel,
        metric,
        grain: parseTimeGrain(params),
        breakdown: breakdownDimension(params),
        names: nameKey,
      }}
      comparisons
      agentOmissions={names.error ? ["Invalid name filters prevented this report from loading."] : []}
      comparisonLabel="Compare spend breakdown with"
    >
      {({ filters, comparison, params: applied, timeZone, currency, dataStatus }) => {
        const paidFilters: PaidMarketingFilters = { ...filters, channel, names: names.rules };
        const paidData = names.error ? null : getPaidMarketing(paidFilters);
        paidData?.catch(() => undefined); // Both regions handle the same query's failure.
        const appliedChannel = (
          <ChannelFilter name="channel" label="Ad platform" value={channel} channels={[]} allLabel="All channels" />
        );
        return (
          <>
            <AdNameFilter
              pathname={PATHNAME}
              params={{ ...applied, ...filters.range }}
              rules={names.rules}
              error={names.error}
            />
            {paidData && (
              <>
                <div className="flex flex-wrap items-end gap-4">
                  <SelectFilter
                    name="grain"
                    label="Trend interval"
                    value={parseTimeGrain(params)}
                    options={[...TIME_GRAINS]}
                  />
                  <SelectFilter
                    name="metric"
                    label="Measure"
                    value={metric}
                    options={PAID_METRICS.map((value) => ({ value, label: METRIC_LABELS[value] }))}
                  />
                  <Suspense
                    fallback={
                      <>
                        <input type="hidden" name="channel" value={channel ?? ""} form={REPORT_FILTER_FORM_ID} />
                        <LoadingState variant="control" label="Loading channels" />
                      </>
                    }
                  >
                    <DataRegion
                      timestamp={false}
                      load={async () => [...new Set((await paidData).channelDays.map((day) => day.channel))].sort()}
                      isEmpty={() => false}
                      emptyMessage="No channels."
                      errorContent={appliedChannel}
                    >
                      {(channels) => (
                        <ChannelFilter
                          name="channel"
                          label="Ad platform"
                          value={channel}
                          channels={channels}
                          allLabel="All channels"
                        />
                      )}
                    </DataRegion>
                  </Suspense>
                </div>
                {dataStatus}
                {names.rules.length > 0 && (
                  <Disclosure summary="Matching names">
                    <Suspense
                      key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${nameKey}`}
                      fallback={<LoadingState variant="control" label="Loading matching names" />}
                    >
                      <DataRegion
                        timestamp={false}
                        load={() => getPaidNames(paidFilters)}
                        isEmpty={(data) => data.rows.length === 0}
                        emptyMessage="No names match these filters. Edit or clear a name filter to try again."
                      >
                        {(data) => <AdNameMatches data={data} rules={names.rules} />}
                      </DataRegion>
                    </Suspense>
                  </Disclosure>
                )}
                <Suspense
                  key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${nameKey}`}
                  fallback={<LoadingState variant="chart" label="Loading paid marketing" />}
                >
                  <DataRegion
                    timestamp={timeZone}
                    load={() => paidData}
                    isEmpty={() => false}
                    emptyMessage="This store has no ad delivery in the selected dates."
                  >
                    {(data) => (
                      <PaidMarketingView
                        data={data}
                        filters={paidFilters}
                        metric={metric}
                        params={applied}
                        currency={currency}
                      />
                    )}
                  </DataRegion>
                </Suspense>
                <SelectFilter
                  name="breakdown"
                  label="Break down spend by"
                  value={breakdownDimension(params)}
                  options={[...BREAKDOWN_DIMENSIONS]}
                />
                <Suspense
                  key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${comparison?.mode}|${breakdownDimension(params)}|${nameKey}`}
                  fallback={<LoadingState variant="chart" label="Loading spend breakdown" />}
                >
                  <DataRegion
                    timestamp={timeZone}
                    load={() => getSpendBreakdown(paidFilters, breakdownDimension(params), comparison?.range ?? null)}
                    isEmpty={(data) => data.rows.length === 0}
                    emptyMessage="No spend rows match these filters."
                  >
                    {(data) => (
                      <SpendBreakdownView
                        data={data}
                        filters={paidFilters}
                        dimension={breakdownDimension(params)}
                        comparison={comparison}
                        params={applied}
                        currency={currency}
                      />
                    )}
                  </DataRegion>
                </Suspense>
              </>
            )}
          </>
        );
      }}
    </ReportPage>
  );
}

function point(value: MetricValue, currency: string | null, metric: PaidMetric): PointValue {
  if (metric === "roas")
    return {
      value: typeof value === "number" ? value : null,
      display: formatMultiple(typeof value === "number" ? value : null),
    };
  if (metric === "revenue" || metric === "cpo")
    return {
      value: typeof value === "number" ? value : null,
      display: formatMoney(typeof value === "number" ? value : null, currency),
    };
  if (typeof value === "string") return { value: decimalToNumber(value), display: formatMoney(value, currency) };
  if (typeof value === "number") return { value, display: formatMeasure(value) };
  return { value, display: value === null ? EMPTY_VALUE : formatCount(value) };
}

function PaidMarketingView({
  data,
  filters,
  metric,
  params,
  currency,
}: {
  data: PaidMarketingData;
  filters: PaidMarketingFilters;
  metric: PaidMetric;
  params: SearchParams;
  currency: string | null;
}) {
  const money = formatMoneyIn(currency);
  const hasCreatives = appConfig.nav.some((item) => item.href === "/creatives");
  const grain = parseTimeGrain(params);
  const { series, byDate, folded } = channelChart(data.channelDays, metric, filters.channel, grain);
  const chart = buildChartData(
    [...new Set(datesInRange(filters.range).map((date) => periodStart(date, grain)))].map((date) => {
      const values: Record<string, PointValue> = {};
      for (const item of series) values[item.key] = point(byDate.get(date)?.[item.key] ?? null, currency, metric);
      const range = periodRange(date, grain, filters.range);
      return {
        label: grain === "day" ? formatDay(date) : formatDateRange(range),
        values,
      };
    }),
  );

  return (
    <div className="flex flex-col gap-6">
      {!data.channelDays.some((day) => !filters.channel || day.channel === filters.channel) ? (
        <EmptyState
          message={
            filters.names?.length
              ? "No ad delivery matches these filters. Try editing or clearing a filter."
              : "No ad delivery matches this channel and date range."
          }
          action={
            filters.names?.length
              ? { href: withParams(PATHNAME, params, { names: null }), label: "Clear name filters" }
              : filters.channel
                ? { href: withParams(PATHNAME, params, { channel: null }), label: "Show all channels" }
                : undefined
          }
        />
      ) : (
        <>
          <Disclosure summary="About these numbers" className="text-sm text-muted-foreground">
            <div data-metric-definition="Paid marketing metrics" className="max-w-prose space-y-2">
              <p>
                Platform attribution can overlap across channels. ROAS is attributed revenue / spend; cost per
                conversion is spend / platform conversions. Ratios use summed inputs within each interval, including
                Other. Missing or zero denominators stay unavailable.
              </p>
              <p>
                Weekly intervals start on Monday and monthly intervals follow the calendar. Boundary intervals include
                only the selected dates; missing observations are not filled with zeros.
              </p>
            </div>
          </Disclosure>
          <ChartCard
            title={`${METRIC_LABELS[metric]} by channel over time`}
            description={
              folded && !filters.channel
                ? `The ${MAX_NAMED_CHANNELS} largest channels by impressions are named; the rest are combined as Other.`
                : undefined
            }
            kind="line"
            categoryHeader="Date"
            series={series}
            data={chart.data}
            plottable={chart.plottable}
          />
          <section aria-labelledby="campaigns-heading" className="flex flex-col gap-3">
            <SectionHeader
              id="campaigns-heading"
              title={`Campaigns${filters.channel ? ` in ${filters.channel}` : ""}`}
              actions={
                <a
                  href={withParams(
                    `${PATHNAME}/export`,
                    {},
                    {
                      store: filters.storeId,
                      ...filters.range,
                      channel: filters.channel,
                      names: serializeAdNameFilters(filters.names ?? []),
                    },
                  )}
                  className={buttonVariants({ variant: "outline", size: "sm" })}
                >
                  <Download aria-hidden /> Download CSV
                </a>
              }
            />
            <p className="text-xs text-muted-foreground">
              CSV includes all loaded campaigns, up to {MAX_CAMPAIGNS}, with raw values and a partial-results flag.
              {hasCreatives &&
                " Select an ad platform, then a campaign to inspect its creatives. Campaign links preserve the selected period and name filters; the separate spend-breakdown comparison does not apply to creative cards."}{" "}
              Spend without a campaign ID appears as (none) in the spend breakdown by campaign.
            </p>
            <DataTable
              caption="Campaigns by spend"
              truncated={data.campaignsTruncated}
              columns={[
                { key: "campaign", header: "Campaign" },
                { key: "channel", header: "Channel" },
                { key: "spend", header: "Spend", align: "right" },
                { key: "impressions", header: "Impressions", align: "right" },
                { key: "clicks", header: "Clicks", align: "right" },
                { key: "ctr", header: "CTR", align: "right" },
                { key: "cpc", header: "CPC", align: "right" },
                { key: "conversions", header: "Conversions", align: "right" },
                { key: "roas", header: "Platform ROAS", align: "right" },
              ]}
              rows={data.campaigns.map((campaign) => {
                const spend = decimalToNumber(campaign.spend);
                const impressions = campaign.impressions === null ? null : toChartNumber(campaign.impressions);
                const clicks = campaign.clicks === null ? null : toChartNumber(campaign.clicks);
                const { ctr, cpc, roas } = campaignRatios(campaign);
                return {
                  id: JSON.stringify([campaign.channel, campaign.campaignId]),
                  cells: {
                    campaign: {
                      display: campaign.campaignName ?? campaign.campaignId,
                      href: hasCreatives
                        ? (drillDown(
                            {
                              store: filters.storeId,
                              ...filters.range,
                              dateBasis: "ad-date",
                              population: "platform delivery",
                              filters: {
                                channel: campaign.channel ?? "(none)",
                                campaign: campaign.campaignId,
                                names: serializeAdNameFilters(filters.names ?? []),
                              },
                            },
                            {
                              pathname: "/creatives",
                              dateBasis: "ad-date",
                              population: "platform delivery",
                              filters: { channel: "channel", campaign: "campaign", names: "names" },
                              required: { view: "returns" },
                            },
                          ).href ?? undefined)
                        : undefined,
                    },
                    channel: {
                      display: campaign.channel ?? EMPTY_VALUE,
                      href: withParams(PATHNAME, params, { channel: campaign.channel ?? "(none)" }),
                    },
                    spend: { display: money(campaign.spend), sort: spend },
                    impressions: { display: formatCount(campaign.impressions), sort: impressions },
                    clicks: { display: formatCount(campaign.clicks), sort: clicks },
                    ctr: { display: formatPercent(ctr), sort: ctr },
                    cpc: { display: money(cpc), sort: cpc },
                    conversions: { display: formatMeasure(campaign.conversions), sort: campaign.conversions },
                    roas: { display: formatMultiple(roas), sort: roas },
                  },
                };
              })}
            />
          </section>
        </>
      )}
    </div>
  );
}
