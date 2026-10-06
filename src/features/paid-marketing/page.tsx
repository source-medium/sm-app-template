import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartCard } from "@/components/charts/chart-card";
import { buildChartData, type PointValue } from "@/components/charts/chart-data";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { DataTable } from "@/components/patterns/data-table";
import { SelectFilter } from "@/components/patterns/select-filter";
import { ReportPage } from "@/components/shell/report-page";
import { toChartNumber } from "@/lib/data/decode";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { datesInRange, parseChoice, preservedParams, single, type SearchParams } from "@/lib/filters";
import {
  EMPTY_VALUE,
  formatCount,
  formatDay,
  formatMeasure,
  formatMoney,
  formatMultiple,
  formatPercent,
} from "@/lib/format";
import { MAX_NAMED_CHANNELS, channelChart, type MetricValue } from "./chart";
import {
  PAID_METRICS,
  getPaidMarketing,
  type PaidMarketingData,
  type PaidMarketingFilters,
  type PaidMetric,
} from "./queries";

export const metadata: Metadata = { title: "Paid marketing" };

const PATHNAME = "/paid-marketing";
const METRIC_LABELS: Record<PaidMetric, string> = {
  spend: "Spend",
  impressions: "Impressions",
  clicks: "Clicks",
  conversions: "Platform-reported conversions",
};

export default async function PaidMarketingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const metric = parseChoice(params, "metric", PAID_METRICS, "spend");
  const channel = single(params, "channel")?.slice(0, 100) || null;

  return (
    <ReportPage
      title="Paid marketing"
      description="Spend and delivery by channel and campaign for one store."
      pathname={PATHNAME}
      params={params}
      preserve={["metric", "channel"]}
    >
      {({ filters }) => {
        const paidFilters: PaidMarketingFilters = { ...filters, channel };
        return (
          <Suspense
            key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}`}
            fallback={<LoadingState variant="chart" label="Loading paid marketing" />}
          >
            <DataRegion
              load={() => getPaidMarketing(paidFilters)}
              isEmpty={(data) => data.channelDays.length === 0}
              emptyMessage="This store has no ad delivery in the selected dates."
            >
              {(data) => <PaidMarketingView data={data} filters={paidFilters} metric={metric} params={params} />}
            </DataRegion>
          </Suspense>
        );
      }}
    </ReportPage>
  );
}

function point(value: MetricValue): PointValue {
  if (typeof value === "string") return { value: decimalToNumber(value), display: formatMoney(value) };
  if (typeof value === "number") return { value, display: formatMeasure(value) };
  return { value, display: value === null ? EMPTY_VALUE : formatCount(value) };
}

function PaidMarketingView({
  data,
  filters,
  metric,
  params,
}: {
  data: PaidMarketingData;
  filters: PaidMarketingFilters;
  metric: PaidMetric;
  params: SearchParams;
}) {
  const { series, byDate, channels, folded } = channelChart(data.channelDays, metric, filters.channel);
  const chart = buildChartData(
    datesInRange(filters.range).map((date) => {
      const values: Record<string, PointValue> = {};
      for (const item of series) values[item.key] = point(byDate.get(date)?.[item.key] ?? null);
      return { label: formatDay(date), values };
    }),
  );

  const channelOptions = [
    { value: "", label: "All channels" },
    ...channels.map((name) => ({ value: name, label: name })),
  ];
  const preserved = preservedParams(params, ["metric", "channel"], filters);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-4">
        <SelectFilter
          pathname={PATHNAME}
          name="metric"
          label="Measure"
          value={metric}
          options={PAID_METRICS.map((value) => ({ value, label: METRIC_LABELS[value] }))}
          preserved={preserved}
        />
        <SelectFilter
          pathname={PATHNAME}
          name="channel"
          label="Channel"
          value={filters.channel ?? ""}
          options={channelOptions}
          preserved={preserved}
        />
      </div>
      <ChartCard
        title={`${METRIC_LABELS[metric]} by channel`}
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
        <h2 id="campaigns-heading" className="text-lg font-semibold">
          Campaigns{filters.channel ? ` in ${filters.channel}` : ""}
        </h2>
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
            const ctr = ratio(clicks, impressions);
            const cpc = ratio(spend, clicks);
            const roas = ratio(campaign.platformRevenue, spend);
            return {
              id: campaign.campaignId,
              cells: {
                campaign: { display: campaign.campaignName ?? campaign.campaignId },
                channel: { display: campaign.channel ?? EMPTY_VALUE },
                spend: { display: formatMoney(campaign.spend), sort: spend },
                impressions: { display: formatCount(campaign.impressions), sort: impressions },
                clicks: { display: formatCount(campaign.clicks), sort: clicks },
                ctr: { display: formatPercent(ctr), sort: ctr },
                cpc: { display: formatMoney(cpc), sort: cpc },
                conversions: { display: formatMeasure(campaign.conversions), sort: campaign.conversions },
                roas: { display: formatMultiple(roas), sort: roas },
              },
            };
          })}
        />
      </section>
    </div>
  );
}
