import type { Metadata } from "next";
import { Suspense } from "react";
import { CardGrid } from "@/components/patterns/card-grid";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { SelectFilter } from "@/components/patterns/select-filter";
import { ReportPage } from "@/components/shell/report-page";
import { parseChoice, preservedParams, type SearchParams } from "@/lib/filters";
import { formatCount, formatMeasure, formatPercent } from "@/lib/format";
import { CREATIVE_SORTS, getCreatives, type CreativeSort, type CreativesData } from "./queries";

export const metadata: Metadata = { title: "Creatives" };

const PATHNAME = "/creatives";
const SORT_LABELS: Record<CreativeSort, string> = {
  impressions: "Most impressions",
  clicks: "Most clicks",
  conversions: "Most conversions",
  ctr: "Highest CTR",
};

export default async function CreativesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const sort = parseChoice(params, "sort", CREATIVE_SORTS, "impressions");
  return (
    <ReportPage
      title="Creatives"
      description="Every ad creative that ran in the selected dates, with its delivery."
      pathname={PATHNAME}
      params={params}
      preserve={["sort"]}
    >
      {({ filters }) => (
        <div className="flex flex-col gap-4">
          <SelectFilter
            pathname={PATHNAME}
            name="sort"
            label="Sort by"
            value={sort}
            options={CREATIVE_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))}
            preserved={preservedParams(params, [], filters)}
          />
          <Suspense
            key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${sort}`}
            fallback={<LoadingState variant="grid" label="Loading creatives" />}
          >
            <DataRegion
              load={() => getCreatives({ ...filters, sort })}
              isEmpty={(data) => data.creatives.length === 0}
              emptyMessage="No ad creatives ran for this store in the selected dates."
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
          id: creative.creativeId,
          title: creative.title ?? creative.body ?? `Creative ${creative.creativeId}`,
          body:
            [creative.body, creative.callToAction ? `Call to action: ${humanize(creative.callToAction)}` : null]
              .filter(Boolean)
              .join(" · ") || null,
          badge: creative.channel,
          imageUrl: creative.imageUrl,
          metrics: [
            { label: "Impressions", display: formatCount(creative.impressions) },
            { label: "Clicks", display: formatCount(creative.clicks) },
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
