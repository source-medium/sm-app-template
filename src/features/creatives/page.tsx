import { CREATIVE_RELATION } from "./rows";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { DataTable } from "@/components/patterns/data-table";
import { decimalToNumber } from "@/lib/data/decimal";
import { CardGrid } from "@/components/patterns/card-grid";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { ChannelFilter } from "@/components/patterns/channel-filter";
import { SelectFilter } from "@/components/patterns/select-filter";
import { AdNameFilter } from "@/components/patterns/ad-name-filter";
import { AdNameMatches } from "@/components/patterns/ad-name-matches";
import { parseAdNameFilters, serializeAdNameFilters } from "@/lib/ad-name-filters";
import { ReportPage } from "@/components/shell/report-page";
import { parseChoice, single, withParams, REPORT_FILTER_FORM_ID, type SearchParams } from "@/lib/filters";
import { formatCount, formatMeasure, formatMoney, formatPercent, formatMultiple } from "@/lib/format";
import { Disclosure } from "@/components/ui/disclosure";
import {
  CREATIVE_SORTS,
  getCreativeChannels,
  getCreatives,
  getCreativeNames,
  type CreativeSort,
  type CreativesData,
} from "./queries";

export const metadata: Metadata = { title: "Creatives" };

const PATHNAME = "/creatives";
const SORT_LABELS: Record<CreativeSort, string> = {
  spend: "Most spend",
  impressions: "Most impressions",
  clicks: "Most clicks",
  conversions: "Most conversions",
  ctr: "Highest CTR",
  revenue: "Most platform revenue",
  roas: "Highest platform ROAS",
  cpo: "Lowest cost / conversion",
};

export default async function CreativesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const channel = single(params, "channel")?.slice(0, 100) || null;
  const campaign = single(params, "campaign")?.slice(0, 200) || null;
  const view = parseChoice(params, "view", ["delivery", "returns", "table"] as const, "delivery");
  const sort = parseChoice(params, "sort", CREATIVE_SORTS, "spend");
  const names = parseAdNameFilters(params);
  const nameKey = serializeAdNameFilters(names.rules);
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
      description="Creative delivery and platform-reported returns for the selected dates."
      pathname={PATHNAME}
      params={params}
      agentFilters={{ channel, sort, campaign, view, names: nameKey }}
      agentOmissions={names.error ? ["Invalid name filters prevented this report from loading."] : []}
    >
      {({ filters, timeZone, currency, params: applied }) => (
        <div className="flex flex-col gap-4">
          <AdNameFilter
            pathname={PATHNAME}
            params={{ ...applied, ...filters.range }}
            rules={names.rules}
            error={names.error}
          />
          {campaign && <input type="hidden" name="campaign" value={campaign} form={REPORT_FILTER_FORM_ID} />}
          {campaign && (
            <p className="text-sm">
              Campaign: {campaign}.{" "}
              <Link className="underline underline-offset-4" href={withParams(PATHNAME, params, { campaign: null })}>
                Show all campaigns
              </Link>
            </p>
          )}
          {!names.error && (
            <>
              {names.rules.length > 0 && (
                <Disclosure summary="Matching names">
                  <Suspense
                    key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${campaign}|${nameKey}`}
                    fallback={<LoadingState variant="control" label="Loading matching names" />}
                  >
                    <DataRegion
                      timestamp={false}
                      load={() => getCreativeNames({ ...filters, sort, channel, campaign, names: names.rules })}
                      isEmpty={(data) => data.rows.length === 0}
                      emptyMessage="No names match these filters. Edit or clear a name filter to try again."
                    >
                      {(data) => <AdNameMatches data={data} rules={names.rules} />}
                    </DataRegion>
                  </Suspense>
                </Disclosure>
              )}
              <div className="flex flex-wrap gap-4">
                <SelectFilter
                  name="view"
                  label="View"
                  value={view}
                  options={[
                    { value: "delivery", label: "Delivery cards" },
                    { value: "returns", label: "Returns cards" },
                    { value: "table", label: "Returns table" },
                  ]}
                />
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
                key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${sort}|${channel}|${campaign}|${view}|${nameKey}`}
                fallback={<LoadingState variant="grid" label="Loading creatives" />}
              >
                <DataRegion
                  timestamp={timeZone}
                  load={() => getCreatives({ ...filters, sort, channel, campaign, names: names.rules })}
                  isEmpty={(data) => data.creatives.length === 0}
                  emptyMessage={
                    names.rules.length
                      ? "No ad creatives match these filters. Try editing or clearing a filter."
                      : "No ad creatives match this store, ad channel, and date range."
                  }
                  emptyAction={
                    names.rules.length
                      ? { href: withParams(PATHNAME, params, { names: null }), label: "Clear name filters" }
                      : channel
                        ? { href: withParams(PATHNAME, params, { channel: null }), label: "Show all ad channels" }
                        : undefined
                  }
                >
                  {(data) => <CreativesView data={data} currency={currency} view={view} />}
                </DataRegion>
              </Suspense>
            </>
          )}
        </div>
      )}
    </ReportPage>
  );
}

function CreativesView({
  data,
  currency,
  view,
}: {
  data: CreativesData;
  currency: string | null;
  view: "delivery" | "returns" | "table";
}) {
  return (
    <div className="flex flex-col gap-3">
      <Disclosure summary="About these numbers" className="text-sm text-muted-foreground">
        <p data-metric-definition="Creative metrics" className="max-w-prose">
          CTR is clicks divided by impressions. Revenue and conversions use each platform&apos;s attribution and may
          overlap across channels. ROAS is revenue / spend; cost per conversion is spend / conversions. Both use period
          totals. Compare spend and conversion volume before interpreting a high return.
        </p>
      </Disclosure>
      {view === "table" ? (
        <DataTable
          caption="Creative returns"
          truncated={data.truncated}
          columns={[
            { key: "name", header: "Creative" },
            { key: "channel", header: "Channel" },
            { key: "spend", header: "Spend", align: "right" },
            { key: "revenue", header: "Platform revenue", align: "right" },
            { key: "conversions", header: "Conversions", align: "right" },
            { key: "roas", header: "Platform ROAS", align: "right" },
            { key: "cpo", header: "Cost / conversion", align: "right" },
          ]}
          rows={data.creatives.map((c) => ({
            id: JSON.stringify([c.channel, c.creativeId]),
            cells: {
              name: { display: c.title ?? c.creativeId },
              channel: { display: c.channel ?? "(none)" },
              spend: { display: formatMoney(c.spend, currency), sort: decimalToNumber(c.spend) },
              revenue: { display: formatMoney(c.revenue, currency), sort: c.revenue },
              conversions: { display: formatMeasure(c.conversions), sort: c.conversions },
              roas: { display: formatMultiple(c.roas), sort: c.roas },
              cpo: { display: formatMoney(c.cpo, currency), sort: c.cpo },
            },
          }))}
        />
      ) : (
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
            action: creative.adUrl ? { href: creative.adUrl, label: "Open ad" } : undefined,
            metrics:
              view === "returns"
                ? [
                    { label: "Spend", display: formatMoney(creative.spend, currency) },
                    { label: "Platform revenue", display: formatMoney(creative.revenue, currency) },
                    { label: "Platform ROAS", display: formatMultiple(creative.roas) },
                    { label: "Cost / conversion", display: formatMoney(creative.cpo, currency) },
                    { label: "Conversions", display: formatMeasure(creative.conversions) },
                  ]
                : [
                    { label: "Spend", display: formatMoney(creative.spend, currency) },
                    { label: "Impressions", display: formatCount(creative.impressions) },
                    { label: "CTR", display: formatPercent(creative.ctr) },
                    { label: "Conversions", display: formatMeasure(creative.conversions) },
                  ],
          }))}
        />
      )}
      {data.truncated && view !== "table" && (
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
