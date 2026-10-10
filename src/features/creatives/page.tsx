import { CREATIVE_RELATION } from "./rows";
import type { Metadata } from "next";
import { Suspense } from "react";
import { CardGrid } from "@/components/patterns/card-grid";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { SelectFilter } from "@/components/patterns/select-filter";
import { ReportPage } from "@/components/shell/report-page";
import { parseChoice, single, type SearchParams } from "@/lib/filters";
import { formatCount, formatMeasure, formatMoney, formatPercent } from "@/lib/format";
import { CREATIVE_SORTS, getCreativeChannels, getCreatives, type CreativeSort, type CreativesData } from "./queries";

export const metadata: Metadata = { title: "Creatives" };

const PATHNAME = "/creatives";
const SORT_LABELS: Record<CreativeSort, string> = {
  spend: "Most spend",
  impressions: "Most impressions",
  clicks: "Most clicks",
  conversions: "Most conversions",
  ctr: "Highest CTR",
};

export default async function CreativesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const channel = single(params, "channel")?.slice(0, 100) || null;
  const sort = parseChoice(params, "sort", CREATIVE_SORTS, "spend");
  return (
    <ReportPage
      sources={[
        {
          relation: CREATIVE_RELATION,
          scope:
            "Daily ad delivery grouped by creative and ad channel over the selected dates. CTR is clicks divided by impressions.",
        },
      ]}
      title="Creatives"
      description="Every ad creative that ran in the selected dates, with its delivery."
      pathname={PATHNAME}
      params={params}
      agentFilters={{ channel, sort }}
    >
      {({ filters, timeZone }) => (
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-4">
            <Suspense
              key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}`}
              fallback={<LoadingState variant="control" label="Loading ad channels" />}
            >
              <DataRegion
                timestamp={false}
                load={() => getCreativeChannels(filters)}
                isEmpty={() => false}
                emptyMessage="No ad channels in this range."
              >
                {(channels) => (
                  <ChannelFilter
                    name="channel"
                    label="Ad channel"
                    allLabel="All ad channels"
                    value={channel}
                    channels={channels}
                  />
                )}
              </DataRegion>
            </Suspense>
            <SelectFilter
              name="sort"
              label="Sort by"
              value={sort}
              options={CREATIVE_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))}
            />
          </div>
          <Suspense
            key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${sort}|${channel}`}
            fallback={<LoadingState variant="grid" label="Loading creatives" />}
          >
            <DataRegion
              timestamp={timeZone}
              load={() => getCreatives({ ...filters, sort, channel })}
              isEmpty={(data) => data.creatives.length === 0}
              emptyMessage="No ad creatives match this store, ad channel, and date range."
            >
              {(data) => <CreativesView data={data} />}
            </DataRegion>
          </Suspense>
        </div>
      )}
    </ReportPage>
  );
}

function CreativesView({ data }: { data: CreativesData }) {
  return (
    <div className="flex flex-col gap-3">
      <CardGrid
        label="Ad creatives"
        cards={data.creatives.map((creative) => ({
          id: JSON.stringify([creative.channel, creative.creativeId]),
          title: creative.title ?? creative.body ?? `Creative ${creative.creativeId}`,
          body:
            [creative.body, creative.callToAction ? `Call to action: ${humanize(creative.callToAction)}` : null]
              .filter(Boolean)
              .join(" · ") || null,
          badge: creative.channel,
          imageUrl: creative.imageUrl,
          metrics: [
            { label: "Spend", display: formatMoney(creative.spend) },
            { label: "Impressions", display: formatCount(creative.impressions) },
            { label: "CTR", display: formatPercent(creative.ctr) },
            { label: "Conversions", display: formatMeasure(creative.conversions) },
          ],
        }))}
      />
      {data.truncated && (
        <p className="text-sm text-muted-foreground">
          Showing the top {data.creatives.length} creatives; more ran in these dates.
        </p>
      )}
    </div>
  );
}

/** SHOP_NOW -> Shop now. */
function humanize(value: string): string {
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
