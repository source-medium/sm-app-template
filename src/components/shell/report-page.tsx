import { Suspense } from "react";
import { cookies } from "next/headers";
import type { MetricBinding } from "@/lib/metric-binding";
import { DataStatus, PendingDataStatus } from "./data-status";
/**
 * The frame every report view shares: title, the store and date filters
 * parsed from the URL, refresh and share controls, and a freshness footer.
 * Each DataRegion timestamps its own successful load, in the store's time zone.
 *
 * A view passes a render function that receives the applied filters.
 *
 * Dates are the store's calendar dates, so the view's queries wait for its
 * time zone. The server remembers a zone once found, so when the URL names a
 * store whose zone it knows, the view's queries start at once, alongside the
 * store list: each is a BigQuery job, so running them together saves a round
 * trip. Otherwise the page first waits for the list.
 */
import { EmptyState, ErrorState, WarehouseErrorState } from "@/components/patterns/data-states";
import { requireViewer } from "@/lib/auth/require-viewer";
import { loadStores, resolveReportStore } from "@/lib/data/stores.server";
import { BASELINE_PARAM, parseComparisonPlan, planParams, type ComparisonPlan } from "@/lib/comparison";
import { BaselineProvider } from "@/components/patterns/baseline-switch";
import { ChartMemoryProvider } from "@/components/charts/chart-memory";
import { CHART_MEMORY_COOKIE, parseChartMemory } from "@/lib/chart-memory";
import { calendarDate } from "@/lib/format";
import {
  dateRangeIssue,
  parseDateRange,
  reportDates,
  single,
  withDates,
  type ReportDates,
  type ReportFilters,
  type SearchParams,
} from "@/lib/filters";
import type { ReportSource } from "@/lib/report-data";
import { ReportFilterBar } from "./report-filter-bar";
import { ReportHeader } from "./report-header";

/**
 * `timeZone` is the store's SourceMedium time zone; `today` is its current date there.
 * `currency` is the store's reporting currency (dim_stores or an app.config.ts override), or null when unknown.
 */
export type ReportContext = {
  filters: ReportFilters;
  /** The URL's parameters with the store and, on dated views, `dates.live`, for links that continue the report. */
  params: SearchParams;
  /** The dates as link parameters: `live` keeps a preset rolling, `fixed` pins this exact period. */
  dates: ReportDates;
  /** Both comparison slots; KPI cards show a row for each. */
  plan?: ComparisonPlan;
  today: string;
  timeZone: string;
  currency: string | null;
  /** Render immediately after feature controls when dataStatusAfterControls is enabled. */
  dataStatus?: React.ReactNode;
};

export async function ReportPage({
  title,
  description,
  pathname,
  params,
  comparisonLabel,
  dates = true,
  maxDays,
  comparisons = false,
  allStores = false,
  agentFilters = {},
  agentOmissions = [],
  sources = [],
  bindings = [],
  clientPresentationParams = [],
  chartParams = [],
  dataStatusAfterControls = false,
  defaults,
  children,
}: {
  title: string;
  description: string;
  pathname: string;
  params: SearchParams;
  /** Name the comparison scope when it affects only part of the report. */
  comparisonLabel?: string;
  /** False for current-state views (such as inventory) that have no date range. */
  dates?: boolean;
  /** Larger ranges require a feature with bounded aggregate queries. */
  maxDays?: number;
  /** Opt in only after the feature queries and presents a comparison period. */
  comparisons?: boolean;
  /** Compare stores separately; store remains the reference for default dates. */
  allStores?: boolean;
  /** Only explicitly selected, parsed feature filters. Never raw searchParams or free-text/row identifiers. */
  agentFilters?: Record<string, string | null>;
  /** Names of active private context omitted from the agent prompt, without its values. */
  agentOmissions?: string[];
  /** Tables and query scope owned by this feature. Dictionary reads happen only on demand. */
  sources?: readonly ReportSource[];
  bindings?: readonly MetricBinding[];
  /** URL presentation keys a feature updates through native history, without a warehouse request. */
  clientPresentationParams?: readonly string[];
  /**
   * Each `MetricChart` param. Copied links name the live measure; links built
   * here never carry one, so following them resumes the measure the browser remembers.
   */
  chartParams?: readonly string[];
  dataStatusAfterControls?: boolean;
  /**
   * URL parameters a view derives from the store's date, such as a default
   * month. They apply like URL parameters: frozen in share links and listed
   * for agents.
   */
  defaults?: (today: string) => Record<string, string>;
  children: (context: ReportContext) => React.ReactNode;
}) {
  const access = await requireViewer();
  const fixedStore = access.storeId !== null;
  // Links built from these params resume each chart's remembered measure rather than a stale one (see chartParams).
  params = Object.fromEntries(Object.entries(params).filter(([key]) => !chartParams.includes(key)));
  const livePresentationParams = [...clientPresentationParams, ...chartParams];

  // Each header also gets the current params, which grow as date defaults and the comparison apply.
  const header = {
    title,
    description,
    pathname,
    dates,
    agentFilters,
    agentOmissions,
    sources,
    bindings,
    clientPresentationParams: livePresentationParams,
    allStores,
    mode: access.mode,
  };

  const store = await resolveReportStore(single(params, "store"));
  if (store.status === "no_store") {
    return (
      <div className="flex flex-col gap-4">
        <ReportHeader {...header} params={params} />
        {store.error ? (
          <WarehouseErrorState error={store.error} />
        ) : (
          <EmptyState message="This warehouse has no stores available yet." />
        )}
      </div>
    );
  }
  // The request's store list, shared with resolveReportStore when it needed one; the filter bar renders it.
  const roster = loadStores();
  // Handled where it is awaited; this keeps an early failure from being reported as unhandled.
  roster.catch(() => undefined);
  if (store.status === "no_date") {
    // The filter bar shows a failed store list itself, or that the store is not listed.
    const rosterFailed = await roster.then(
      () => false,
      () => true,
    );
    return (
      <div className="flex flex-col gap-4">
        <ReportHeader {...header} params={params} storeId={store.storeId} />
        <ReportFilterBar
          roster={roster}
          storeId={store.storeId}
          pathname={pathname}
          params={params}
          range={null}
          today={null}
          dates={false}
          allStores={allStores}
          fixedStore={fixedStore}
        />
        {store.error && !rosterFailed && <WarehouseErrorState error={store.error} />}
      </div>
    );
  }
  // Links built from params name the store, so the next page can run its queries in parallel.
  const { storeId, timeZone, currency } = store;
  const today = calendarDate(new Date(), timeZone);
  const derived = defaults?.(today) ?? {};
  params = { ...params, ...derived };
  const range = parseDateRange(params, today, maxDays);
  const issue = dates ? dateRangeIssue(params, today, maxDays) : null;
  const dateParams = reportDates(params, range, issue);
  const plan = comparisons && dates ? parseComparisonPlan(params, range, today) : undefined;
  if (plan) params = { ...params, ...planParams(plan) };
  // Which slot the charts and tables show is a presentation choice made without a request.
  const presentationParams = plan ? [...livePresentationParams, BASELINE_PARAM] : livePresentationParams;
  // Read on the server, so a reload paints each chart's remembered measure without a client-side switch.
  const chartMemory = parseChartMemory((await cookies()).get(CHART_MEMORY_COOKIE)?.value);
  const zoneLabel = /^[+-]/.test(timeZone) ? `UTC${timeZone}` : timeZone;
  const dataStatus =
    !issue && sources.length > 0 && !allStores ? (
      <Suspense fallback={<PendingDataStatus />}>
        <DataStatus storeId={storeId} sources={sources} bindings={bindings} />
      </Suspense>
    ) : null;
  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        {...header}
        clientPresentationParams={presentationParams}
        params={params}
        storeId={storeId}
        currency={allStores ? null : currency}
        view={{ range, issue, plan, derived, fixed: dateParams.fixed, live: dateParams.live }}
        timeZone={timeZone}
      />
      <ReportFilterBar
        roster={roster}
        storeId={storeId}
        pathname={pathname}
        params={params}
        range={range}
        dateParams={dateParams}
        today={today}
        maxDays={maxDays}
        comparisonLabel={comparisonLabel}
        dates={dates}
        plan={plan}
        allStores={allStores}
        fixedStore={fixedStore}
      />
      {!dataStatusAfterControls && dataStatus}
      {issue ? (
        <ErrorState
          tone="warning"
          title="Check the date range"
          remedy={`${issue} The dates above show a suggested range. Apply it or pick another range to load the report.`}
        />
      ) : (
        <BaselineProvider available={[!!plan?.slots[0].range, !!plan?.slots[1].range]}>
          <ChartMemoryProvider initial={chartMemory}>
            {children({
              filters: { storeId, range },
              params: { ...(dates ? withDates(params, dateParams.live) : params), store: storeId },
              dates: dateParams,
              plan,
              today,
              timeZone,
              currency,
              dataStatus,
            })}
          </ChartMemoryProvider>
        </BaselineProvider>
      )}
      <footer className="border-t pt-4 text-xs text-muted-foreground">
        {access.mode === "sample"
          ? "Synthetic sample data for demonstration; not from any warehouse."
          : "Data freshness unknown."}
        {dates &&
          (allStores
            ? ` The same calendar dates are used in each store's local time. Default dates use ${zoneLabel}.`
            : ` Dates are calendar dates in the store's time zone, ${zoneLabel}.`)}
        {dates && range.to === today && " Today may be incomplete."}
        {/* A known currency is already named under the title; the footer only carries what the header cannot. */}
        {(allStores || !currency) && (
          <span className="mt-1 block">
            {allStores
              ? "Reporting currencies are shown per store. Amounts are never added across stores."
              : "Reporting currency unknown; amounts are unlabeled."}
          </span>
        )}
      </footer>
    </div>
  );
}
