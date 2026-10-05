import type { Metadata } from "next";
import { Suspense } from "react";
import { ChartCard, type ChartSeries } from "@/components/charts/chart-card";
import { buildChartData, type PointValue } from "@/components/charts/chart-data";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { DataTable } from "@/components/patterns/data-table";
import { SelectFilter } from "@/components/patterns/select-filter";
import { ReportPage } from "@/components/shell/report-page";
import { toChartNumber } from "@/lib/data/decode";
import { datesInRange, parseChoice, preservedParams, single, type SearchParams } from "@/lib/filters";
import { EMPTY_VALUE, formatCount, formatDay, formatMeasure, formatPercent } from "@/lib/format";
import {
  PAID_METRICS,
  getPaidMarketing,
  type AdMeasures,
  type PaidMarketingData,
  type PaidMarketingFilters,
  type PaidMetric,
} from "./queries";

export const metadata: Metadata = { title: "Paid marketing" };

const PATHNAME = "/paid-marketing";
const METRIC_LABELS: Record<PaidMetric, string> = {
  impressions: "Impressions",
  clicks: "Clicks",
  conversions: "Platform-reported conversions",
};
/** Seven named series at most; the rest fold into "Other". Colors follow the channel, never its rank. */
const MAX_NAMED_CHANNELS = 7;

export default async function PaidMarketingPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const metric = parseChoice(params, "metric", PAID_METRICS, "impressions");
  const channel = single(params, "channel")?.slice(0, 100) || null;

  return (
    <ReportPage
      title="Paid marketing"
      description="Impressions, clicks, and platform-reported conversions by channel and campaign for one store."
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

function metricValue(measures: AdMeasures, metric: PaidMetric): bigint | number | null {
  return metric === "impressions" ? measures.impressions : metric === "clicks" ? measures.clicks : measures.conversions;
}

function metricDisplay(value: bigint | number | null): string {
  return typeof value === "number" ? formatMeasure(value) : formatCount(value);
}

function addValues(a: bigint | number | null, b: bigint | number | null): bigint | number | null {
  if (a === null) return b;
  if (b === null) return a;
  return typeof a === "bigint" && typeof b === "bigint" ? a + b : Number(a) + Number(b);
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
  // Rank channels by impressions to choose which are named; color them in name order so filters never repaint.
  const totals = new Map<string, bigint>();
  for (const day of data.channelDays)
    totals.set(day.channel, (totals.get(day.channel) ?? 0n) + (day.impressions ?? 0n));
  const allChannels = [...totals.keys()].sort((a, b) => a.localeCompare(b));
  const named = [...totals.entries()]
    .sort(([, a], [, b]) => (a === b ? 0 : a > b ? -1 : 1))
    .slice(0, MAX_NAMED_CHANNELS)
    .map(([name]) => name)
    .sort((a, b) => a.localeCompare(b));
  const folded = allChannels.length > named.length;
  const visible = filters.channel ? named.filter((name) => name === filters.channel) : named;
  const series: ChartSeries[] = visible.map((name) => ({
    key: `channel${named.indexOf(name)}`,
    label: name,
    color: `var(--chart-${named.indexOf(name) + 1})`,
  }));
  if (folded && !filters.channel) series.push({ key: "other", label: "Other", color: "var(--chart-8)" });

  const byDate = new Map<string, Record<string, bigint | number | null>>();
  for (const day of data.channelDays) {
    const values = byDate.get(day.date) ?? {};
    const index = named.indexOf(day.channel);
    const key = index >= 0 ? `channel${index}` : "other";
    values[key] = addValues(values[key] ?? null, metricValue(day, metric));
    byDate.set(day.date, values);
  }
  const chart = buildChartData(
    datesInRange(filters.range).map((date) => {
      const values: Record<string, PointValue> = {};
      for (const item of series) {
        const value = byDate.get(date)?.[item.key] ?? null;
        values[item.key] = { value, display: value === null ? EMPTY_VALUE : metricDisplay(value) };
      }
      return { label: formatDay(date), values };
    }),
  );

  const channelOptions = [
    { value: "", label: "All channels" },
    ...allChannels.map((name) => ({ value: name, label: name })),
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
          preserved={withoutKey(preserved, "metric")}
        />
        <SelectFilter
          pathname={PATHNAME}
          name="channel"
          label="Channel"
          value={filters.channel ?? ""}
          options={channelOptions}
          preserved={withoutKey(preserved, "channel")}
        />
      </div>
      <ChartCard
        title={`${METRIC_LABELS[metric]} by channel`}
        description={
          folded
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
          caption="Campaigns by impressions"
          truncated={data.campaignsTruncated}
          columns={[
            { key: "campaign", header: "Campaign" },
            { key: "channel", header: "Channel" },
            { key: "impressions", header: "Impressions", align: "right" },
            { key: "clicks", header: "Clicks", align: "right" },
            { key: "ctr", header: "CTR", align: "right" },
            { key: "conversions", header: "Conversions", align: "right" },
          ]}
          rows={data.campaigns.map((campaign) => {
            const impressions = campaign.impressions === null ? null : toChartNumber(campaign.impressions);
            const clicks = campaign.clicks === null ? null : toChartNumber(campaign.clicks);
            const ctr = impressions && clicks !== null ? clicks / impressions : null;
            return {
              id: campaign.campaignId,
              cells: {
                campaign: { display: campaign.campaignName ?? campaign.campaignId },
                channel: { display: campaign.channel ?? EMPTY_VALUE },
                impressions: { display: formatCount(campaign.impressions), sort: impressions },
                clicks: { display: formatCount(campaign.clicks), sort: clicks },
                ctr: { display: formatPercent(ctr), sort: ctr },
                conversions: { display: formatMeasure(campaign.conversions), sort: campaign.conversions },
              },
            };
          })}
        />
      </section>
    </div>
  );
}

function withoutKey(record: Record<string, string>, key: string): Record<string, string> {
  const { [key]: _omitted, ...rest } = record;
  return rest;
}
