import { assetHref } from "./assets";
import { AssetGallery } from "./asset-gallery";
import { creativeBindings, creativeBinding } from "./metrics";
import { MetricDefinition } from "@/components/patterns/metric-definition";
import { Check, Plus } from "lucide-react";
import { LinkPending } from "@/components/shell/pending";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import {
  CREATIVE_FORMATS,
  CREATIVE_SORTS,
  creativeFormatLabel,
  creativesOptions,
  type CreativeIdentity,
  type CreativeSort,
} from "./filters";
import { CREATIVE_RELATION, LAUNCH_LOOKBACK_DAYS, type FirstSpend } from "./rows";
import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { DataTable } from "@/components/patterns/data-table";
import { decimalToNumber } from "@/lib/data/decimal";
import { AnchoredReportBody } from "@/components/patterns/anchored-report-body";
import { CreativeComparisonTable } from "./comparison-table";
import { CardGrid } from "@/components/patterns/card-grid";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { ChannelRosterFilter } from "@/components/patterns/channel-filter";
import { SelectFilter } from "@/components/patterns/select-filter";
import { AdNameFilter } from "@/components/patterns/ad-name-filter";
import { AdNameMatchesRegion } from "@/components/patterns/ad-name-matches";
import { serializeAdNameFilters } from "@/lib/ad-name-filters";
import { adPlatformLabel } from "@/lib/ad-platforms";
import { PlatformMark } from "@/components/patterns/platform-mark";
import { ReportControls } from "@/components/shell/report-controls";
import { ReportPage } from "@/components/shell/report-page";
import { single, withParams, REPORT_FILTER_FORM_ID, type ReportFilters, type SearchParams } from "@/lib/filters";
import {
  formatCount,
  formatAttributedConversions,
  formatDate,
  EMPTY_VALUE,
  formatMoney,
  formatPercent,
  formatMultiple,
} from "@/lib/format";
import { Disclosure } from "@/components/ui/disclosure";
import { SectionHeader } from "@/components/patterns/section-header";
import { ActiveBaseline } from "@/components/patterns/baseline-switch";
import { changeCell, kpiDelta } from "@/components/patterns/kpi-delta";
import type { KpiDelta } from "@/components/patterns/kpi-card";
import { planRanges, slotChanges, type ComparisonPlan, type Polarity } from "@/lib/comparison";
import { CREATIVE_POLARITY } from "./metrics";
import { CreativeSummaryView } from "./summary";
import {
  COMPARISON_HEADING,
  ResolvedSelectionBar,
  SelectionBar,
  creativeTitle,
  findSelectedCreative,
  matchesCreative,
  needsSelectionLookup,
  resolveSelectedCreatives,
} from "./selection-bar";
import {
  getCreativeChannels,
  getCreativeSummary,
  getCreatives,
  getCreativeNames,
  type Creative,
  type CreativeMeasures,
  type CreativesData,
  type CreativesFilters,
} from "./queries";

export const metadata: Metadata = { title: "Creatives" };

const PATHNAME = "/creatives";
const GALLERY_HEADING = "creative-list-heading";
const rankedActionId = (index: number) => `ranked-creative-${index + 1}`;

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

const VIEW_LABELS: Record<"delivery" | "returns" | "table", string> = {
  delivery: "Delivery cards",
  returns: "Performance cards",
  table: "Performance table",
};

export default async function CreativesPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  if (single(params, "view") === "assets") return <AssetGallery params={params} />;
  const { channel, campaign, format, view, sort, minimumSpend, minimumConversions, thresholdError, selection, names } =
    creativesOptions(params);
  // The parsed filters, so a metric definition never echoes a rejected or overlong URL value.
  const definitionFilters = (filters: ReportFilters) => ({
    store: filters.storeId,
    ...filters.range,
    ad_platform: channel,
    campaign,
    format,
    min_spend: minimumSpend,
    min_conversions: minimumConversions,
  });
  const nameKey = serializeAdNameFilters(names.rules);
  return (
    <ReportPage
      bindings={creativeBindings}
      dataStatusAfterControls
      sources={[
        {
          relation: CREATIVE_RELATION,
          scope:
            "Daily ad delivery grouped by creative and ad platform (source_system) over the selected and comparison dates, with each creative's format (ad_creative_format) and first day of spend. CTR is clicks divided by impressions.",
        },
      ]}
      title="Creatives"
      description="Which creatives earn their spend, what is new, and what changed."
      pathname={PATHNAME}
      params={params}
      comparisons
      comparisonLabel="Compare creatives with"
      agentFilters={{
        channel,
        sort,
        campaign,
        format,
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
      {({ filters, plan, timeZone, currency, params: applied, dataStatus }) => {
        const scope: CreativesFilters = {
          ...filters,
          sort,
          channel,
          campaign,
          format,
          names: names.rules,
          minimumSpend,
          minimumConversions,
        };
        const baselines = planRanges(plan);
        const comparisonKey = `${plan?.slots[0].mode}|${plan?.slots[1].mode}`;
        const scopeKey = `${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${campaign}|${format}|${nameKey}|${comparisonKey}`;
        let summaryLoad: ReturnType<typeof getCreativeSummary> | undefined;
        const loadSummary = () => (summaryLoad ??= getCreativeSummary(scope, baselines));
        let listLoad: ReturnType<typeof getCreatives> | undefined;
        const loadList = () => (listLoad ??= getCreatives(scope, baselines));
        let selectedLoad: ReturnType<typeof getCreatives> | undefined;
        const loadSelected = () =>
          (selectedLoad ??= resolveSelectedCreatives(selection.items, loadList, () =>
            getCreatives({ ...scope, selection: selection.items }, baselines),
          ));
        // Only the final region waits for the other queries to finish before stamping the report.
        const loadFinalSummary = async () => {
          const totals = await loadSummary();
          await Promise.allSettled([loadList(), ...(selection.items.length > 0 ? [loadSelected()] : [])]);
          return totals;
        };
        const lastSelected = selection.items.at(-1);
        return (
          <AnchoredReportBody
            navigationKey={JSON.stringify(selection.items)}
            defaultFragment={lastSelected ? COMPARISON_HEADING : undefined}
          >
            <nav
              aria-label="Creative report shortcuts"
              className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-medium underline-offset-4"
            >
              {!names.error && !thresholdError && (
                <a className="underline" href={`#${GALLERY_HEADING}`}>
                  Jump to ranked creatives
                </a>
              )}
              {!names.error && !thresholdError && (
                <a className="underline" href="#creative-performance-heading">
                  Performance summary
                </a>
              )}
              <Link prefetch={false} className="underline" href={assetHref(applied, channel)}>
                Browse creative assets
              </Link>
            </nav>
            <ReportControls
              keepOpen={Boolean(names.error) || Boolean(thresholdError)}
              summary={[
                VIEW_LABELS[view],
                channel ? adPlatformLabel(channel) : "All ad platforms",
                format ? creativeFormatLabel(format) : "All formats",
                SORT_LABELS[sort],
                ...(minimumSpend ? [`Minimum spend ${minimumSpend}`] : []),
                ...(minimumConversions ? [`Minimum conversions ${minimumConversions}`] : []),
                ...(names.rules.length
                  ? [`${names.rules.length} name ${names.rules.length === 1 ? "filter" : "filters"}`]
                  : []),
              ]}
            >
              <div className="flex w-full flex-col gap-3">
                <AdNameFilter pathname={PATHNAME} params={applied} rules={names.rules} error={names.error} />
                <div className="flex flex-wrap items-end gap-4">
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="creative-min-spend" className="text-xs font-medium text-muted-foreground">
                      Minimum spend
                    </label>
                    <Input
                      id="creative-min-spend"
                      name="min_spend"
                      inputMode="decimal"
                      defaultValue={minimumSpend ?? ""}
                      form={REPORT_FILTER_FORM_ID}
                      placeholder="No minimum"
                      className="sm:w-40"
                    />
                  </div>
                  <div className="flex min-w-0 flex-col gap-1.5">
                    <label htmlFor="creative-min-conversions" className="text-xs font-medium text-muted-foreground">
                      Minimum conversions
                    </label>
                    <Input
                      id="creative-min-conversions"
                      name="min_conversions"
                      inputMode="decimal"
                      defaultValue={minimumConversions ?? ""}
                      form={REPORT_FILTER_FORM_ID}
                      placeholder="No minimum"
                      className="sm:w-40"
                    />
                  </div>
                  {!names.error && !thresholdError && (
                    <>
                      <SelectFilter
                        name="view"
                        label="View"
                        value={view}
                        options={Object.entries(VIEW_LABELS).map(([value, label]) => ({ value, label }))}
                      />
                      <ChannelRosterFilter
                        key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}`}
                        load={() => getCreativeChannels(filters)}
                        value={channel}
                        name="channel"
                        label="Ad platform"
                        allLabel="All ad platforms"
                        loadingLabel="Loading ad platforms"
                        optionLabel={adPlatformLabel}
                      />
                      <SelectFilter
                        name="format"
                        label="Format"
                        value={format ?? ""}
                        options={[
                          { value: "", label: "All formats" },
                          ...CREATIVE_FORMATS.map(({ value, label }) => ({ value, label })),
                        ]}
                      />
                      <SelectFilter
                        name="sort"
                        label="Sort by"
                        value={sort}
                        options={CREATIVE_SORTS.map((value) => ({ value, label: SORT_LABELS[value] }))}
                      />
                    </>
                  )}
                </div>
              </div>
            </ReportControls>
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
                    <AdNameMatchesRegion
                      key={`${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}|${campaign}|${nameKey}`}
                      load={() => getCreativeNames({ ...filters, sort, channel, campaign, names: names.rules })}
                      rules={names.rules}
                    />
                  </Disclosure>
                )}
                {dataStatus}
                {selection.items.length > 0 && (
                  <input
                    type="hidden"
                    name="selection"
                    value={JSON.stringify(selection.items)}
                    form={REPORT_FILTER_FORM_ID}
                  />
                )}
                <section aria-labelledby={GALLERY_HEADING} className="flex flex-col gap-3">
                  <SectionHeader
                    id={GALLERY_HEADING}
                    headingProps={{ tabIndex: -1 }}
                    title="All creatives"
                    description={
                      <>
                        {SORT_LABELS[sort]} first.
                        {!minimumSpend && !minimumConversions && (
                          <Suspense fallback={null}>
                            <CreativeHeadline load={loadSummary} currency={currency} />
                          </Suspense>
                        )}
                      </>
                    }
                  />
                  <Suspense
                    key={`list|${scopeKey}|${sort}|${view}|${minimumSpend}|${minimumConversions}`}
                    fallback={<LoadingState variant="grid" label="Loading creatives" />}
                  >
                    <DataRegion
                      timestamp={false}
                      load={loadList}
                      isEmpty={(data) => data.creatives.length === 0}
                      emptyMessage={
                        names.rules.length
                          ? "No ad creatives match these filters. Try editing or clearing a filter."
                          : "No ad creatives match this store, ad platform, and date range."
                      }
                      emptyAction={
                        names.rules.length
                          ? { href: withParams(PATHNAME, params, { names: null }), label: "Clear name filters" }
                          : format
                            ? { href: withParams(PATHNAME, params, { format: null }), label: "Show all formats" }
                            : channel
                              ? {
                                  href: withParams(PATHNAME, params, { channel: null }),
                                  label: "Show all ad platforms",
                                }
                              : undefined
                      }
                    >
                      {(data) => (
                        <CreativesView
                          data={data}
                          plan={plan}
                          currency={currency}
                          timeZone={timeZone}
                          view={view}
                          selection={selection.items}
                          loadSelected={loadSelected}
                          scopeFilters={definitionFilters(filters)}
                          params={applied}
                        />
                      )}
                    </DataRegion>
                  </Suspense>
                </section>
                {lastSelected && (
                  <section aria-labelledby={COMPARISON_HEADING} className="space-y-3">
                    <SectionHeader
                      id={COMPARISON_HEADING}
                      title={`Creative comparison (${selection.items.length}/4)`}
                      headingProps={{ tabIndex: -1 }}
                      actions={
                        <Link
                          prefetch={false}
                          className="text-sm underline"
                          href={`${withParams(PATHNAME, applied, { selection: null })}#${GALLERY_HEADING}`}
                        >
                          Clear selection
                        </Link>
                      }
                    />
                    <Suspense fallback={browseGallery}>
                      <ComparisonNavigation
                        load={loadList}
                        loadSelected={loadSelected}
                        lastSelected={lastSelected}
                        count={selection.items.length}
                        table={view === "table"}
                      />
                    </Suspense>
                    {selection.items.length >= 2 && (
                      <Suspense
                        key={JSON.stringify([scopeKey, minimumSpend, minimumConversions, selection.items])}
                        fallback={<LoadingState variant="table" label="Loading selected creatives" />}
                      >
                        <DataRegion
                          timestamp={false}
                          load={loadSelected}
                          isEmpty={(data) => data.creatives.length === 0}
                          emptyMessage="None of the selected creatives match the applied scope and thresholds."
                        >
                          {(data) => (
                            <>
                              <p className="text-sm">
                                {data.creatives.length} of {selection.items.length} selected creatives match. Missing
                                selections are not zero. Platforms may attribute conversions differently.
                              </p>
                              <CreativesView
                                data={data}
                                plan={plan}
                                currency={currency}
                                timeZone={timeZone}
                                view="returns"
                                selection={selection.items}
                                scopeFilters={definitionFilters(filters)}
                                params={applied}
                                comparison
                              />
                            </>
                          )}
                        </DataRegion>
                      </Suspense>
                    )}
                  </section>
                )}
                <section aria-labelledby="creative-performance-heading" className="flex flex-col gap-3">
                  <SectionHeader
                    id="creative-performance-heading"
                    title="Performance summary"
                    headingProps={{ tabIndex: -1 }}
                  />
                  <Suspense
                    key={`summary|${scopeKey}`}
                    fallback={<LoadingState variant="kpis" label="Loading creative totals" />}
                  >
                    <DataRegion
                      timestamp={timeZone}
                      load={loadFinalSummary}
                      isEmpty={() => false}
                      emptyMessage="No ad creatives match this store, ad platform, and date range."
                    >
                      {(summary) => (
                        <CreativeSummaryView
                          summary={summary}
                          plan={plan}
                          range={filters.range}
                          format={format}
                          params={applied}
                          pathname={PATHNAME}
                          currency={currency}
                        />
                      )}
                    </DataRegion>
                  </Suspense>
                </section>
              </>
            )}
          </AnchoredReportBody>
        );
      }}
    </ReportPage>
  );
}

async function CreativeHeadline({
  load,
  currency,
}: {
  load: () => ReturnType<typeof getCreativeSummary>;
  currency: string | null;
}) {
  const summary = await load().catch((error: unknown) => {
    if (error instanceof WarehouseError) return null; // The full summary owns its error and remedy.
    throw error;
  });
  const totals = summary?.totals?.current;
  return totals ? (
    <>
      {" "}
      · {formatCount(totals.creatives)} creatives with spend · {formatMoney(totals.spend, currency)} linked spend
    </>
  ) : null;
}

const browseGallery = (
  <a className="text-sm underline" href={`#${GALLERY_HEADING}`}>
    Browse all creatives
  </a>
);

/** The same ranking supplies both the name and the action to return to, including after a sort or filter change. */
async function ComparisonNavigation({
  load,
  loadSelected,
  lastSelected: [channel, id],
  count,
  table,
}: {
  load: () => Promise<CreativesData>;
  loadSelected: () => Promise<CreativesData>;
  lastSelected: CreativeIdentity;
  count: number;
  table: boolean;
}) {
  let data: CreativesData;
  try {
    data = await load();
  } catch (error) {
    // The gallery owns the warehouse error. Its heading remains a usable return target.
    if (error instanceof WarehouseError) return browseGallery;
    throw error;
  }
  const index = data.creatives.findIndex((creative) => matchesCreative(creative, [channel, id]));
  const target = index >= 0 && !table ? rankedActionId(index) : GALLERY_HEADING;
  const last = count === 1 ? await findSelectedCreative(data, [channel, id], loadSelected) : undefined;
  return (
    <>
      {count === 1 && (
        <p className="text-sm">
          Selected <strong>{last ? creativeTitle(last) : id}</strong> · {adPlatformLabel(channel)}
        </p>
      )}
      <a className="w-fit text-sm font-medium underline underline-offset-4" href={`#${target}`}>
        {count < 4 ? "Choose another creative" : "Back to all creatives"}
      </a>
    </>
  );
}

type Measure = keyof Omit<CreativeMeasures, "impressions" | "clicks">;

/** One creative's change on one measure against the slot's period, or nothing when the slot shows no changes. */
function creativeChange<M extends Measure>(
  creative: Creative,
  slot: 0 | 1 | null,
  measure: M,
  format: (value: Creative[M]) => string,
) {
  if (slot === null) return undefined;
  const better: Polarity = CREATIVE_POLARITY[measure];
  type Value = NonNullable<Creative[M]>;
  // Each measure is one type in every period; TypeScript cannot narrow an indexed access to it.
  return kpiDelta<Value>(
    creative[measure] as Value | null,
    creative.baselines[slot][measure] as Value | null,
    format,
    better,
  );
}

/** A card's change line; a compared creative with no comparison value (a new one) shows a dash, keeping rows aligned. */
function cardChange(delta: KpiDelta | undefined) {
  if (!delta) return undefined;
  if (delta.short) return { display: delta.short, tone: delta.tone };
  return { display: delta.direction === "flat" ? "No change" : EMPTY_VALUE, tone: null };
}

/** A creative's first spend in words, the same on its card and in the table; null with no spend. */
function firstSpendLabel(first: FirstSpend | null): string | null {
  if (!first) return null;
  if (first.when === "older") return "Running for over a year";
  return `${first.when === "launched" ? "Launched" : "Running since"} ${formatDate(first.date)}`;
}

function assetAction(params: SearchParams, creative: Creative) {
  switch (creative.assets) {
    case "available":
      return { display: "View assets", href: assetHref(params, creative.channel, creative.creativeId) };
    case "no_match":
      return { display: "No current assets" };
    case "no_platform_inventory":
      return { display: "No inventory for this platform" };
    case "unknown":
      return { display: "Asset availability unknown" };
  }
}

function ComparisonAction({
  creative,
  selection,
  params,
  anchorId,
}: {
  creative: Creative;
  selection: readonly CreativeIdentity[];
  params: SearchParams;
  anchorId?: string;
}) {
  const identity: CreativeIdentity = [creative.channel, creative.creativeId];
  const matches = (item: CreativeIdentity) => matchesCreative(creative, item);
  const selected = selection.some(matches);
  if (!selected && selection.length >= 4) return <span className="text-sm text-muted-foreground">Four selected</span>;
  const next = selected ? selection.filter((item) => !matches(item)) : [...selection, identity];
  return (
    <>
      <Link
        prefetch={false}
        className={cn(
          "inline-flex w-fit scroll-mb-52 items-center gap-1.5 rounded-md px-2 py-1 text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring",
          selected && anchorId ? "bg-accent text-accent-foreground" : "underline underline-offset-4",
        )}
        scroll={!anchorId}
        data-scroll-nearest={anchorId ? "" : undefined}
        id={anchorId}
        href={`${withParams(PATHNAME, params, { selection: next.length ? JSON.stringify(next) : null })}#${anchorId ?? (next.length ? COMPARISON_HEADING : GALLERY_HEADING)}`}
      >
        {anchorId &&
          (selected ? (
            <Check aria-hidden className="size-4 shrink-0" />
          ) : (
            <Plus aria-hidden className="size-4 shrink-0" />
          ))}
        {selected && anchorId ? (
          <>
            Selected{" "}
            <span className="font-normal underline">
              Remove<span className="sr-only"> from comparison</span>
            </span>
          </>
        ) : selected ? (
          "Remove from comparison"
        ) : (
          "Compare creative"
        )}
        <LinkPending />
      </Link>
      {anchorId && selected && selection.length >= 2 && (
        <a href={`#${COMPARISON_HEADING}`} className="sr-only focus:not-sr-only focus:underline">
          View comparison
        </a>
      )}
    </>
  );
}

function CreativesView({
  data,
  plan,
  currency,
  timeZone,
  view,
  selection,
  loadSelected,
  params,
  scopeFilters,
  comparison = false,
}: {
  selection: readonly CreativeIdentity[];
  loadSelected?: () => Promise<CreativesData>;
  params: SearchParams;
  scopeFilters: Record<string, string | null> & { store: string };
  comparison?: boolean;
  data: CreativesData;
  plan?: ComparisonPlan;
  currency: string | null;
  timeZone: string;
  view: "delivery" | "returns" | "table";
}) {
  const money = (value: string | number | null) => formatMoney(value, currency);
  const changes = plan ? slotChanges(plan, data.coverage) : null;
  /** The list for one comparison slot (null: no comparison); both slots render and the active one shows. */
  const list = (slot: 0 | 1 | null) => {
    const baseline = slot === null ? undefined : plan?.slots[slot];
    const shown = slot !== null && Boolean(changes?.[slot].show && baseline?.range) ? slot : null;
    const versus = shown !== null && baseline ? `vs ${baseline.short}` : null;
    if (view === "table")
      return (
        <DataTable
          key={data.creatives.length}
          caption="Creative performance"
          truncated={data.truncated}
          columns={[
            { key: "name", header: "Creative" },
            { key: "assets", header: "Current assets" },
            { key: "channel", header: "Ad platform" },
            { key: "format", header: "Format" },
            { key: "first", header: "Started", nowrap: true },
            { key: "spend", header: "Spend", align: "right" },
            ...(versus ? [{ key: "spendChange", header: `Spend ${versus}`, align: "right" as const }] : []),
            { key: "revenue", header: "Platform revenue", align: "right" },
            { key: "conversions", header: "Conversions", align: "right" },
            { key: "roas", header: "Platform ROAS", align: "right" },
            ...(versus ? [{ key: "roasChange", header: `ROAS ${versus}`, align: "right" as const }] : []),
            { key: "cpo", header: "Cost / conversion", align: "right" },
            ...(versus ? [{ key: "cpoChange", header: `Cost / conversion ${versus}`, align: "right" as const }] : []),
            { key: "ctr", header: "CTR", align: "right" },
          ]}
          preservePageOnDataChange
          rows={data.creatives.map((c, index) => {
            const action = assetAction(params, c);
            const change = <M extends Measure>(measure: M, format: (value: Creative[M]) => string) => {
              const delta = creativeChange(c, shown, measure, format);
              return delta ? changeCell(delta) : { display: "" };
            };
            return {
              id: JSON.stringify([c.channel, c.creativeId]),
              cells: {
                name: {
                  display: creativeTitle(c),
                  href: action.href,
                  secondary: (
                    <ComparisonAction
                      creative={c}
                      params={params}
                      selection={selection}
                      anchorId={rankedActionId(index)}
                    />
                  ),
                },
                assets: { display: action.href ? "Available" : action.display },
                channel: { display: adPlatformLabel(c.channel), leading: <PlatformMark platform={c.channel} /> },
                format: { display: creativeFormatLabel(c.format) },
                // An older creative sorts before every dated one.
                first: {
                  display: firstSpendLabel(c.firstSpend) ?? EMPTY_VALUE,
                  sort: c.firstSpend === null ? null : c.firstSpend.when === "older" ? "" : c.firstSpend.date,
                },
                spend: { display: money(c.spend), sort: decimalToNumber(c.spend) },
                spendChange: change("spend", money),
                revenue: { display: money(c.revenue), sort: c.revenue },
                conversions: { display: formatAttributedConversions(c.conversions), sort: c.conversions },
                roas: { display: formatMultiple(c.roas), sort: c.roas },
                roasChange: change("roas", formatMultiple),
                cpo: { display: money(c.cpo), sort: c.cpo },
                cpoChange: change("cpo", money),
                ctr: { display: formatPercent(c.ctr), sort: c.ctr },
              },
            };
          })}
        />
      );
    const creatives = comparison
      ? selection.flatMap((identity) => data.creatives.filter((c) => matchesCreative(c, identity)))
      : data.creatives;
    const cards = creatives.map((creative, index) => {
      const action = assetAction(params, creative);
      const metric = <M extends Measure>(label: string, measure: M, format: (value: Creative[M]) => string) => ({
        label,
        display: format(creative[measure]),
        change: cardChange(creativeChange(creative, shown, measure, format)),
      });
      const spend = metric("Spend", "spend", money);
      const conversions = metric("Conversions", "conversions", formatAttributedConversions);
      const impressions = { label: "Impressions", display: formatCount(creative.impressions) };
      function metrics() {
        if (view === "delivery") return [spend, impressions, metric("CTR", "ctr", formatPercent), conversions];
        const roas = metric("Platform ROAS", "roas", formatMultiple);
        const cpo = metric("Cost / conversion", "cpo", money);
        return comparison
          ? [
              spend,
              conversions,
              cpo,
              roas,
              metric("Platform revenue", "revenue", money),
              impressions,
              metric("CTR", "ctr", formatPercent),
            ]
          : [spend, roas, cpo, conversions];
      }
      return {
        id: JSON.stringify([creative.channel, creative.creativeId]),
        creativeId: creative.creativeId,
        title: creativeTitle(creative),
        selected: selection.some((item) => matchesCreative(creative, item)),
        body: creative.body,
        callToAction: creative.callToAction ? humanize(creative.callToAction) : undefined,
        badge: adPlatformLabel(creative.channel),
        badgeMark: <PlatformMark platform={creative.channel} className="size-4" />,
        tags: [
          ...(creative.format ? [{ label: creativeFormatLabel(creative.format) }] : []),
          ...(creative.firstSpend?.when === "launched" ? [{ label: "New", highlight: true }] : []),
        ],
        caption: firstSpendLabel(creative.firstSpend) ?? undefined,
        imageUrl: creative.imageUrl,
        imageFallbackUrl: creative.imageFallbackUrl,
        media: creative.media,
        footer: (
          <>
            {action.href ? (
              <Link prefetch={false} className="text-sm font-medium underline underline-offset-4" href={action.href}>
                {action.display}
              </Link>
            ) : (
              <span className="text-sm text-muted-foreground">{action.display}</span>
            )}
            <ComparisonAction
              creative={creative}
              selection={selection}
              params={params}
              anchorId={comparison ? undefined : rankedActionId(index)}
            />
          </>
        ),
        action: creative.adUrl ? { href: creative.adUrl, label: "Open ad" } : undefined,
        metrics: metrics(),
      };
    });
    const grid = comparison ? (
      <CreativeComparisonTable cards={cards} />
    ) : (
      <CardGrid label="Ad creatives" cards={cards} />
    );
    if (!versus) return grid;
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">Changes compare each creative with itself, {versus}.</p>
        {grid}
      </div>
    );
  };
  return (
    <div className="flex flex-col gap-3">
      {plan ? <ActiveBaseline a={list(0)} b={list(1)} /> : list(null)}
      {data.truncated && view !== "table" && (
        <p className="text-sm text-muted-foreground">
          Showing the top {data.creatives.length} creatives; more ran in these dates.
        </p>
      )}
      <Disclosure summary="About these numbers" variant="note">
        <div className="max-w-prose space-y-3">
          <p data-metric-definition="Creative metrics">
            CTR is clicks divided by impressions. Revenue and conversions use each platform&apos;s attribution and may
            overlap across ad platforms. ROAS is revenue / spend; cost per conversion is spend / conversions. Both use
            period totals. Compare spend and conversion volume before interpreting a high return. Platform-reported
            conversions can be fractional; attribution models, windows and conversion-event settings are unverified.
          </p>
          <p>
            Each change compares a creative with its own delivery in the comparison period, and shows a dash when it had
            none then. &ldquo;New&rdquo; marks a creative whose first spend falls in these dates: its first day with
            spend on this ad platform, on any campaign, looking back {LAUNCH_LOOKBACK_DAYS} days before them. Formats
            are the ad platform&apos;s, as SourceMedium classifies them.
          </p>
          <MetricDefinition binding={creativeBinding("roas")} scope={{ filters: scopeFilters, currency, timeZone }} />
        </div>
      </Disclosure>
      {!comparison &&
        (loadSelected && needsSelectionLookup(data, selection) ? (
          <Suspense fallback={<SelectionBar selection={selection} creatives={data.creatives} />}>
            <ResolvedSelectionBar selection={selection} creatives={data.creatives} loadSelected={loadSelected} />
          </Suspense>
        ) : (
          <SelectionBar selection={selection} creatives={data.creatives} />
        ))}
    </div>
  );
}

/** SHOP_NOW -> Shop now. */
function humanize(value: string): string {
  const text = value.toLowerCase().replace(/_/g, " ");
  return text.charAt(0).toUpperCase() + text.slice(1);
}
