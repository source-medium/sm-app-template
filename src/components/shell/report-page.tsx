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
import { EmptyState, ErrorState } from "@/components/patterns/data-states";
import { requireViewer } from "@/lib/auth/require-viewer";
import { loadStores, resolveReportStore } from "@/lib/data/stores.server";
import { parseComparison, type Comparison } from "@/lib/comparison";
import { calendarDate } from "@/lib/format";
import { dateRangeIssue, parseDateRange, single, type ReportFilters, type SearchParams } from "@/lib/filters";
import type { ReportSource } from "@/lib/report-data";
import { ReportFilterBar } from "./report-filter-bar";
import { ReportHeader } from "./report-header";

/**
 * `timeZone` is the store's SourceMedium time zone; `today` is its current date there.
 * `currency` is the verified reporting currency configured for this store, or null when unverified.
 */
export type ReportContext = {
  filters: ReportFilters;
  params: SearchParams;
  comparison?: Comparison;
  today: string;
  timeZone: string;
  currency: string | null;
};

export async function ReportPage({
  title,
  description,
  pathname,
  params,
  comparisonLabel,
  dates = true,
  comparisons = false,
  allStores = false,
  agentFilters = {},
  agentOmissions = [],
  sources = [],
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

  // Each header also gets the current params, which grow as date defaults and the comparison apply.
  const header = {
    title,
    description,
    pathname,
    dates,
    agentFilters,
    agentOmissions,
    sources,
    allStores,
    mode: access.mode,
  };

  const store = await resolveReportStore(single(params, "store"));
  if (store.status === "no_store") {
    return (
      <div className="flex flex-col gap-4">
        <ReportHeader {...header} params={params} />
        {store.error ? (
          <ErrorState title={store.error.title} remedy={store.error.remedy} detail={store.error.detail} />
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
        {store.error && !rosterFailed && (
          <ErrorState title={store.error.title} remedy={store.error.remedy} detail={store.error.detail} />
        )}
      </div>
    );
  }
  // Links built from params name the store, so the next page can run its queries in parallel.
  const { storeId, timeZone, currency } = store;
  const today = calendarDate(new Date(), timeZone);
  const derived = defaults?.(today) ?? {};
  params = { ...params, ...derived };
  const range = parseDateRange(params, today);
  const issue = dates ? dateRangeIssue(params, today) : null;
  const comparison = comparisons && dates ? parseComparison(params, range) : undefined;
  if (comparison) params = { ...params, compare: comparison.mode };
  const zoneLabel = /^[+-]/.test(timeZone) ? `UTC${timeZone}` : timeZone;
  return (
    <div className="flex flex-col gap-4">
      <ReportHeader
        {...header}
        params={params}
        storeId={storeId}
        currency={allStores ? null : currency}
        view={{ range, issue, comparison, derived }}
      />
      <ReportFilterBar
        roster={roster}
        storeId={storeId}
        pathname={pathname}
        params={params}
        range={range}
        today={today}
        comparisonLabel={comparisonLabel}
        dates={dates}
        comparison={comparison}
        allStores={allStores}
        fixedStore={fixedStore}
      />
      {issue ? (
        <ErrorState
          tone="warning"
          title="Check the date range"
          remedy={`${issue} The dates above show a suggested range. Apply it or pick another range to load the report.`}
        />
      ) : (
        children({
          filters: { storeId, range },
          params: { ...params, store: storeId },
          comparison,
          today,
          timeZone,
          currency,
        })
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
        {/* A verified currency is already named under the title; the footer only carries what the header cannot. */}
        {(allStores || !currency) && (
          <span className="mt-1 block">
            {allStores
              ? "Reporting currencies are shown per store. Amounts are never added across stores."
              : "Reporting currency unverified; amounts are unlabeled."}
          </span>
        )}
      </footer>
    </div>
  );
}
