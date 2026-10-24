import { appConfig } from "@/app.config";
import type { Metadata } from "next";
import { Suspense } from "react";
import { ReportPage } from "@/components/shell/report-page";
import { ReportControls } from "@/components/shell/report-controls";
import { DataRegion } from "@/components/patterns/data-region";
import { LoadingState } from "@/components/patterns/data-states";
import { SelectFilter } from "@/components/patterns/select-filter";
import { MultiChannelFilter, SalesChannelFilter } from "@/components/patterns/multi-channel-filter";
import { buttonVariants } from "@/components/ui/button";
import {
  parseChoice,
  salesChannelLabel,
  summarySalesChannel,
  withParams,
  single,
  type SearchParams,
} from "@/lib/filters";
import { parseTimeGrain, TIME_GRAINS } from "@/lib/time-grain";
import { getBusiness, getPlatforms, getPerformanceChannels, type PerformanceFilters } from "./queries";
import { BUSINESS_RELATION, PLATFORM_RELATION } from "./rows";
import { BusinessTable, PlatformFilter, PlatformTables, METRIC_GROUPS, platformLabel } from "./tables";

export const metadata: Metadata = { title: "Performance tables" };
export default async function PerformancePage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const view = parseChoice(params, "view", ["business", "platforms"], "business");
  const group = parseChoice(
    params,
    "metric_group",
    METRIC_GROUPS.map((item) => item.value),
    "revenue",
  );
  const grain = parseTimeGrain(params);
  const platform = single(params, "platform")?.slice(0, 200) ?? "";
  const channel = summarySalesChannel(params);
  return (
    <ReportPage
      dataStatusAfterControls
      maxDays={appConfig.summaryMaxDays}
      title="Performance tables"
      description="Review business and platform performance over time, using one calendar grain and explicit sales-channel scope."
      pathname="/performance"
      params={{ ...params, sales_channel: channel ?? "" }}
      agentFilters={{
        view,
        grain,
        platform: view === "platforms" ? platform : null,
        metric_group: view === "business" ? group : null,
        sales_channel: channel,
      }}
      sources={[
        {
          relation: view === "business" ? BUSINESS_RELATION : PLATFORM_RELATION,
          scope:
            view === "business"
              ? "Selected store, dates and sales channels, aggregated into calendar periods. Summary orders are published order measures; revenue and orders count valid sales channels."
              : "Selected store, dates and sales channels, aggregated by advertising source_system and calendar period. Platform attribution is not deduplicated.",
        },
      ]}
    >
      {({ filters, timeZone, currency, dataStatus }) => {
        const selected: PerformanceFilters = { ...filters, grain, channel };
        const scope = `${filters.storeId}|${filters.range.from}|${filters.range.to}|${channel}`;
        const applied = <MultiChannelFilter channels={[]} />;
        const platformData = view === "platforms" ? getPlatforms(selected) : null;
        platformData?.catch(() => undefined); // The roster and tables handle the same query's failure.
        const appliedPlatform = <PlatformFilter platform={platform} />;
        const reportLabel =
          view === "business"
            ? "Business"
            : `Platform detail: ${platform ? platformLabel(platform) : "Combined platforms"}`;
        const grainLabel = TIME_GRAINS.find((item) => item.value === grain)?.label.toLowerCase();
        const channelLabel = salesChannelLabel(channel);
        const download = (
          <a
            className={buttonVariants({ variant: "outline", size: "sm" })}
            href={withParams(
              "/performance/export",
              {},
              { store: filters.storeId, ...filters.range, sales_channel: channel ?? "", grain, view, platform },
            )}
          >
            Download {view === "business" ? "business" : "platform"} CSV
          </a>
        );
        const businessActions = (
          <>
            <a
              className={buttonVariants({ variant: "outline", size: "sm" })}
              href={withParams(
                "/overview",
                {},
                { store: filters.storeId, ...filters.range, sales_channel: channel ?? "", compare: "year" },
              )}
            >
              Compare last year in Overview
            </a>
            {download}
          </>
        );
        return (
          <div className="flex flex-col gap-4 sm:gap-6">
            <ReportControls summary={`${reportLabel}, ${grainLabel}. ${channelLabel}.`}>
              <SelectFilter
                name="view"
                label="Report"
                value={view}
                options={[
                  { value: "business", label: "Business performance" },
                  { value: "platforms", label: "Platform performance" },
                ]}
              />
              <SelectFilter name="grain" label="Period" value={grain} options={[...TIME_GRAINS]} />
              {view === "business" && (
                <SelectFilter name="metric_group" label="Metrics" value={group} options={[...METRIC_GROUPS]} />
              )}
              <SalesChannelFilter key={scope} value={channel}>
                <Suspense key={scope} fallback={<LoadingState variant="control" label="Loading sales channels" />}>
                  <DataRegion
                    timestamp={false}
                    load={() => getPerformanceChannels(selected)}
                    isEmpty={() => false}
                    emptyMessage="No sales channels."
                    errorContent={applied}
                  >
                    {(channels) => <MultiChannelFilter channels={channels} />}
                  </DataRegion>
                </Suspense>
              </SalesChannelFilter>
              {platformData && (
                <Suspense
                  key={`platform-options|${scope}|${grain}|${platform}`}
                  fallback={
                    <>
                      {appliedPlatform}
                      <LoadingState variant="control" label="Loading platforms" />
                    </>
                  }
                >
                  <DataRegion
                    timestamp={false}
                    load={() => platformData}
                    isEmpty={() => false}
                    emptyMessage="No platforms."
                    errorContent={appliedPlatform}
                  >
                    {(records) => <PlatformFilter records={records} platform={platform} />}
                  </DataRegion>
                </Suspense>
              )}
            </ReportControls>
            {dataStatus}
            {view === "business" ? (
              <Suspense
                key={`business|${scope}|${grain}|${group}`}
                fallback={<LoadingState variant="table" label="Loading business performance" />}
              >
                <DataRegion
                  timestamp={timeZone}
                  load={() => getBusiness(selected)}
                  isEmpty={(rows) => !rows.some((row) => !row.is_total)}
                  emptyMessage="No business rows match this store, sales channel, and date range."
                  emptyAction={
                    channel
                      ? {
                          href: withParams("/performance", params, { sales_channel: "" }),
                          label: "Show all sales channels",
                        }
                      : undefined
                  }
                >
                  {(records) => (
                    <BusinessTable
                      records={records}
                      filters={selected}
                      group={group}
                      currency={currency}
                      actions={businessActions}
                    />
                  )}
                </DataRegion>
              </Suspense>
            ) : (
              platformData && (
                <Suspense
                  key={`platforms|${scope}|${grain}|${platform}`}
                  fallback={<LoadingState variant="table" label="Loading platform performance" />}
                >
                  <DataRegion
                    timestamp={timeZone}
                    load={() => platformData}
                    isEmpty={(rows) => !rows.some((row) => !row.is_total)}
                    emptyMessage="No platform rows match this store, sales channel, and date range."
                    emptyAction={
                      channel
                        ? {
                            href: withParams("/performance", params, { sales_channel: "" }),
                            label: "Show all sales channels",
                          }
                        : undefined
                    }
                  >
                    {(records) => (
                      <PlatformTables
                        records={records}
                        filters={selected}
                        currency={currency}
                        platform={platform}
                        actions={download}
                      />
                    )}
                  </DataRegion>
                </Suspense>
              )
            )}
          </div>
        );
      }}
    </ReportPage>
  );
}
