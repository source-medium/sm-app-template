import { creativeBindings, creativeBinding } from "./metrics";
import { MetricDefinition } from "@/components/patterns/metric-definition";
import { Input } from "@/components/ui/input";
import { parseCreativeThreshold, parseCreativeSelection, type CreativeIdentity } from "./filters";
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
import { formatCount, formatAttributedConversions, formatMoney, formatPercent, formatMultiple } from "@/lib/format";
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
  const view = parseChoice(params, "view", ["delivery", "returns", "table"] as const, "returns");
  const minimumSpend = parseCreativeThreshold(single(params, "min_spend"));
  const minimumConversions = parseCreativeThreshold(single(params, "min_conversions"));
  const thresholdError =
    (single(params, "min_spend") && minimumSpend === null) ||
    (single(params, "min_conversions") && minimumConversions === null);
  const selection = parseCreativeSelection(params);
  const sort = parseChoice(params, "sort", CREATIVE_SORTS, "spend");
  const names = parseAdNameFilters(params);
  const nameKey = serializeAdNameFilters(names.rules);
  return (
    <ReportPage
      bindings={creativeBindings}
      dataStatusAfterControls
      sources={[
        {
          relation: CREATIVE_RELATION,
          scope:
            "Daily ad delivery grouped by creative and ad channel over the selected dates. CTR is clicks divided by impressions.",
        },
      ]}
      title="Creatives"
      description="Explore creative performance with spend, platform attribution and conversion volume together."
      pathname={PATHNAME}
      params={params}
      agentFilters={{
        channel,
        sort,
        campaign,
        view,
        names: nameKey,
        min_spend: minimumSpend,
        min_conversions: minimumConversions,
      }}
      agentOmissions={[
        ...(names.error ? ["Invalid name filters prevented this report from loading."] : []),
        ...(single(params, "selection") ? ["Selected creative identities"] : []),
      ]}
    >
      {({ filters, timeZone, currency, params: applied, dataStatus }) => (
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
              <Link
                prefetch={false}
                className="underline underline-offset-4"
                href={withParams(PATHNAME, params, { campaign: null })}
              >
                Show all campaigns
              </Link>
            </p>
          )}
          {selection.error && (
            <p role="status">
              {selection.error}{" "}
              <Link prefetch={false} className="underline" href={withParams(PATHNAME, applied, { selection: null })}>
                Clear selection
              </Link>
            </p>
          )}
          <div className="flex flex-wrap gap-4">
            <label htmlFor="creative-min-spend" className="space-y-1 text-sm">
              Minimum spend
              <Input
                id="creative-min-spend"
                name="min_spend"
                inputMode="decimal"
                defaultValue={minimumSpend ?? ""}
                form={REPORT_FILTER_FORM_ID}
                placeholder="No minimum"
              />
            </label>
            <label htmlFor="creative-min-conversions" className="space-y-1 text-sm">
              Minimum conversions
              <Input
                id="creative-min-conversions"
                name="min_conversions"
                inputMode="decimal"
                defaultValue={minimumConversions ?? ""}
                form={REPORT_FILTER_FORM_ID}
                placeholder="No minimum"
              />
            </label>
          </div>
          {thresholdError && (
            <p role="status">
              Minimums must be non-negative decimal amounts with at most nine decimal places. Correct or clear the
              minimum to load this report.
            </p>
          )}
          {!names.error && !thresholdError && (
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
                    { value: "returns", label: "Performance cards" },
                    { value: "table", label: "Performance table" },
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
              {dataStatus}
              {selection.items.length > 0 && (
                <input
                  type="hidden"
                  name="selection"
                  value={JSON.stringify(selection.items)}
                  form={REPORT_FILTER_FORM_ID}
                />
              )}
              {selection.items.length > 0 && (
                <section aria-labelledby="creative-comparison-heading" className="space-y-3">
                  <h2 id="creative-comparison-heading" className="text-lg font-semibold">
                    Creative comparison ({selection.items.length}/4)
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    Choose two to four creatives. Every value uses the same store, dates and filters. Platform-reported
                    conversions can be fractional; attribution models, windows and conversion-event settings are
                    unverified. Different platforms do not establish comparable winners.
                  </p>
                  <Link
                    prefetch={false}
                    className="text-sm underline"
                    href={withParams(PATHNAME, applied, { selection: null })}
                  >
                    Clear selection
                  </Link>
                  {selection.items.length >= 2 && (
                    <Suspense
                      key={JSON.stringify([
                        filters,
                        channel,
                        campaign,
                        nameKey,
                        minimumSpend,
                        minimumConversions,
                        selection.items,
                      ])}
                      fallback={<LoadingState variant="table" label="Loading selected creatives" />}
                    >
                      <DataRegion
                        timestamp={timeZone}
                        load={() =>
                          getCreatives({
                            ...filters,
                            sort,
                            channel,
                            campaign,
                            names: names.rules,
                            minimumSpend,
                            minimumConversions,
                            selection: selection.items,
                          })
                        }
                        isEmpty={(data) => data.creatives.length === 0}
                        emptyMessage="None of the selected creatives match the applied scope and thresholds."
                      >
                        {(data) => (
                          <>
                            <p className="text-sm">
                              {data.creatives.length} of {selection.items.length} selected creatives match. Missing
                              selections are not zero.
                            </p>
                            <CreativesView
                              data={data}
                              currency={currency}
                              timeZone={timeZone}
                              view="returns"
                              selection={selection.items}
                              params={{ ...applied, ...filters.range }}
                              comparison
                            />
                          </>
                        )}
                      </DataRegion>
                    </Suspense>
                  )}
                </section>
              )}
              <Suspense
                key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${sort}|${channel}|${campaign}|${view}|${nameKey}|${minimumSpend}|${minimumConversions}`}
                fallback={<LoadingState variant="grid" label="Loading creatives" />}
              >
                <DataRegion
                  timestamp={timeZone}
                  load={() =>
                    getCreatives({
                      ...filters,
                      sort,
                      channel,
                      campaign,
                      names: names.rules,
                      minimumSpend,
                      minimumConversions,
                    })
                  }
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
                  {(data) => (
                    <CreativesView
                      data={data}
                      currency={currency}
                      timeZone={timeZone}
                      view={view}
                      selection={selection.items}
                      params={{ ...applied, ...filters.range }}
                    />
                  )}
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
  timeZone,
  view,
  selection,
  params,
  comparison = false,
}: {
  selection: readonly CreativeIdentity[];
  params: SearchParams;
  comparison?: boolean;
  data: CreativesData;
  currency: string | null;
  timeZone: string;
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
          caption="Creative performance"
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
              conversions: { display: formatAttributedConversions(c.conversions), sort: c.conversions },
              roas: { display: formatMultiple(c.roas), sort: c.roas },
              cpo: { display: formatMoney(c.cpo, currency), sort: c.cpo },
            },
          }))}
        />
      ) : (
        <CardGrid
          label={comparison ? "Selected creatives" : "Ad creatives"}
          cards={data.creatives.map((creative) => ({
            id: JSON.stringify([creative.channel, creative.creativeId]),
            title: creative.title ?? creative.body ?? `Creative ${creative.creativeId}`,
            body:
              [creative.body, creative.callToAction ? `Call to action: ${humanize(creative.callToAction)}` : null]
                .filter(Boolean)
                .join(" · ") || null,
            badge: creative.channel,
            imageUrl: creative.imageUrl,
            definitionLabel: "About platform ROAS",
            definition: (
              <MetricDefinition
                binding={creativeBinding("roas")}
                scope={{
                  filters: {
                    store: single(params, "store") ?? null,
                    from: single(params, "from") ?? null,
                    to: single(params, "to") ?? null,
                    channel: creative.channel,
                    campaign: single(params, "campaign") ?? null,
                    min_spend: single(params, "min_spend") ?? null,
                    min_conversions: single(params, "min_conversions") ?? null,
                  },
                  currency,
                  timeZone,
                }}
              />
            ),
            footer: (() => {
              const identity: CreativeIdentity = [creative.channel ?? "(none)", creative.creativeId];
              const selected = selection.some(([channel, id]) => channel === identity[0] && id === identity[1]);
              if (!selected && selection.length >= 4)
                return <span className="text-sm text-muted-foreground">Four selected</span>;
              const next = selected
                ? selection.filter(([channel, id]) => channel !== identity[0] || id !== identity[1])
                : [...selection, identity];
              return (
                <Link
                  prefetch={false}
                  className="text-sm underline underline-offset-4"
                  href={withParams(PATHNAME, params, { selection: next.length ? JSON.stringify(next) : null })}
                >
                  {selected ? "Remove from comparison" : "Compare creative"}
                </Link>
              );
            })(),
            action: creative.adUrl ? { href: creative.adUrl, label: "Open ad" } : undefined,
            metrics:
              view === "returns"
                ? [
                    {
                      label: "Spend",
                      display: formatMoney(creative.spend, currency),
                    },
                    { label: "Platform ROAS", display: formatMultiple(creative.roas) },
                    { label: "Cost / conversion", display: formatMoney(creative.cpo, currency) },
                    { label: "Conversions", display: formatAttributedConversions(creative.conversions) },
                    { label: "Platform revenue", display: formatMoney(creative.revenue, currency) },
                    { label: "Impressions", display: formatCount(creative.impressions) },
                    { label: "CTR", display: formatPercent(creative.ctr) },
                  ]
                : [
                    {
                      label: "Spend",
                      display: formatMoney(creative.spend, currency),
                    },
                    { label: "Impressions", display: formatCount(creative.impressions) },
                    { label: "CTR", display: formatPercent(creative.ctr) },
                    { label: "Conversions", display: formatAttributedConversions(creative.conversions) },
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
