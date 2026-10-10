/**
 * The frame every report view shares: title, the store and date filters
 * parsed from the URL, refresh and share controls, and a freshness footer.
 * Each DataRegion timestamps its own successful load.
 *
 * A view passes a render function that receives the applied filters.
 *
 * Dates are the store's calendar dates, so the view's queries wait for its
 * time zone. The server remembers a zone once found, so when the URL names a
 * store whose zone it knows, the view's queries start at once, alongside the
 * store list: each is a BigQuery job, so running them together saves a round
 * trip. Otherwise the page first waits for the list.
 */
import { Suspense } from "react";
import type { AgentReportContext } from "@/lib/agent-prompt";
import type { ReportSource } from "@/lib/report-data";
import { AboutData } from "./about-data";
import { appConfig } from "@/app.config";
import { EmptyState, ErrorState } from "@/components/patterns/data-states";
import { FilterBar } from "@/components/shell/filter-bar";
import { CopyReportLink } from "@/components/shell/copy-report-link";
import { RefreshReport } from "@/components/shell/refresh-report";
import { Skeleton } from "@/components/ui/skeleton";
import { requestedStore, requireViewer } from "@/lib/auth/require-viewer";
import { loadStores, storeTimeZone, type StoreOption } from "@/lib/data/stores.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { parseComparison, type Comparison } from "@/lib/comparison";
import { calendarDate } from "@/lib/format";
import {
  datePresets,
  dateRangeIssue,
  parseDateRange,
  single,
  withParams,
  type DateRange,
  type ReportFilters,
  type SearchParams,
} from "@/lib/filters";

/** `today` is the store's current date in its SourceMedium time zone. */
export type ReportContext = { filters: ReportFilters; params: SearchParams; comparison?: Comparison; today: string };

type FilterBarProps = {
  pathname: string;
  params: SearchParams;
  /** Null when the store's date is unknown, which hides the date controls. */
  range: DateRange | null;
  today: string | null;
  comparisonLabel?: string;
  dates: boolean;
  comparison?: Comparison;
  fixedStore: boolean;
};

export async function ReportPage({
  title,
  description,
  pathname,
  params,
  comparisonLabel,
  dates = true,
  comparisons = false,
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
  const requested = await requestedStore(single(params, "store"));
  const roster = loadStores();
  // Handled where it is awaited; this keeps an early failure from being reported as unhandled.
  roster.catch(() => undefined);
  const fixedStore = access.storeId !== null;

  /** `view` is the applied report state, once the store's date is known. */
  function header(
    storeId?: string,
    view?: { range: DateRange; issue: string | null; comparison?: Comparison; derived: Record<string, string> },
  ) {
    const shareHref =
      storeId && view ? withParams(pathname, params, { store: storeId, ...(dates ? view.range : {}) }) : null;
    const agentContext: AgentReportContext = {
      pathname,
      title,
      filters: {
        ...agentFilters,
        ...view?.derived,
        ...(storeId ? { store: storeId } : {}),
        ...(view && dates && !view.issue ? view.range : {}),
        ...(view?.comparison && !view.issue ? { compare: view.comparison.mode } : {}),
      },
      currency: appConfig.currency,
      sources: sources.map((source) => source.relation),
      status: view?.issue
        ? `Report not loaded: ${view.issue}`
        : storeId && view
          ? undefined
          : "Store context is unavailable; report not loaded.",
      omitted: agentOmissions,
    };
    return (
      <header
        data-agent-page={JSON.stringify(agentContext)}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
          {appConfig.currency && (
            <p className="text-xs text-muted-foreground">Reporting currency: {appConfig.currency}</p>
          )}
        </div>
        <div className="flex flex-wrap items-start gap-2">
          {sources.length > 0 && (
            <AboutData key={JSON.stringify(agentContext)} context={agentContext} sources={sources} mode={access.mode} />
          )}
          <RefreshReport />
          {shareHref && <CopyReportLink key={shareHref} href={shareHref} />}
        </div>
      </header>
    );
  }

  let stores: StoreOption[] | null = null;
  let storeId: string;
  if (requested !== null) storeId = requested;
  else {
    try {
      stores = await roster;
    } catch (error) {
      if (!(error instanceof WarehouseError)) throw error;
      return (
        <div className="flex flex-col gap-4">
          {header()}
          <ErrorState title={error.title} remedy={error.remedy} detail={error.detail} />
        </div>
      );
    }
    const first = stores[0];
    if (!first) {
      return (
        <div className="flex flex-col gap-4">
          {header()}
          <EmptyState message="This warehouse has no stores available yet." />
        </div>
      );
    }
    // Links built from params now name the store, so the next page runs its queries in parallel.
    storeId = first.id;
  }

  /** The store picker without dates, for a store whose date is unknown. */
  const storeOnly = (notice: React.ReactNode) => (
    <div className="flex flex-col gap-4">
      {header(storeId)}
      <Suspense fallback={<Skeleton className="h-[4.75rem] rounded-lg" />}>
        <RosterFilterBar
          roster={roster}
          storeId={storeId}
          pathname={pathname}
          params={params}
          range={null}
          today={null}
          dates={false}
          fixedStore={fixedStore}
        />
      </Suspense>
      {notice}
    </div>
  );

  let timeZone: string | null;
  try {
    timeZone = await storeTimeZone(storeId, stores ?? roster);
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    // The filter bar reports a store list failure itself.
    const rosterFailed = await roster.then(
      () => false,
      () => true,
    );
    return storeOnly(
      rosterFailed ? null : <ErrorState title={error.title} remedy={error.remedy} detail={error.detail} />,
    );
  }
  // An unlisted store without recent orders: the filter bar says it is not listed.
  if (timeZone === null) return storeOnly(null);

  const today = calendarDate(new Date(), timeZone);
  const derived = defaults?.(today) ?? {};
  params = { ...params, ...derived };
  const range = parseDateRange(params, today);
  const issue = dates ? dateRangeIssue(params, today) : null;
  const comparison = comparisons && dates ? parseComparison(params, range) : undefined;
  if (comparison) params = { ...params, compare: comparison.mode };
  const barProps: FilterBarProps = {
    pathname,
    params,
    range,
    today,
    comparisonLabel,
    dates,
    comparison,
    fixedStore,
  };
  const zoneLabel = /^[+-]/.test(timeZone) ? `UTC${timeZone}` : timeZone;
  return (
    <div className="flex flex-col gap-4">
      {header(storeId, { range, issue, comparison, derived })}
      {stores ? (
        <StoreFilterBar stores={stores} storeId={storeId} {...barProps} />
      ) : (
        <Suspense fallback={<Skeleton className="h-[4.75rem] rounded-lg" />}>
          <RosterFilterBar roster={roster} storeId={storeId} {...barProps} />
        </Suspense>
      )}
      {issue ? (
        <ErrorState
          title="Check the date range"
          remedy={`${issue} The controls show a suggested range. Apply it or choose another range to load the report.`}
        />
      ) : (
        children({ filters: { storeId, range }, params: { ...params, store: storeId }, comparison, today })
      )}
      <footer className="border-t pt-4 text-xs text-muted-foreground">
        {access.mode === "sample"
          ? "Synthetic sample data for demonstration; not from any warehouse."
          : "Data freshness unknown."}
        {dates && ` Dates are calendar dates in the store's time zone, ${zoneLabel}.`}
        {dates && range.to === today && " Today may be incomplete."}
        {appConfig.currency && <span className="mt-1 block">Reporting currency: {appConfig.currency}.</span>}
      </footer>
    </div>
  );
}

/** The filter bar once the store list arrives; says so when the URL names a store the warehouse does not have. */
async function RosterFilterBar({
  roster,
  storeId,
  ...props
}: FilterBarProps & { roster: Promise<StoreOption[]>; storeId: string }) {
  let stores: StoreOption[];
  try {
    stores = await roster;
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return <ErrorState title={error.title} remedy={error.remedy} detail={error.detail} />;
  }
  if (stores.some((store) => store.id === storeId))
    return <StoreFilterBar stores={stores} storeId={storeId} {...props} />;
  return (
    <div className="flex flex-col gap-3">
      <ErrorState
        title="This store is not in the store list"
        remedy={
          props.fixedStore
            ? "The configured store is not one this app lists. Ask the app owner to check APP_STORE_ID."
            : "The link names a store this app does not list. Choose a listed store to continue."
        }
      />
      {stores[0] && <StoreFilterBar stores={stores} storeId={storeId} {...props} />}
    </div>
  );
}

function StoreFilterBar({
  stores,
  storeId,
  pathname,
  params,
  range,
  today,
  comparisonLabel,
  dates,
  comparison,
  fixedStore,
}: FilterBarProps & { stores: StoreOption[]; storeId: string }) {
  const presets =
    dates && today !== null && range !== null
      ? datePresets(today).map(({ label, range: preset }) => ({
          label,
          href: withParams(pathname, params, { store: storeId, ...preset, cursor: null, order: null }),
          active: range.from === preset.from && range.to === preset.to,
        }))
      : [];
  return (
    <FilterBar
      key={`${storeId}|${range?.from}|${range?.to}|${comparison?.mode}`}
      pathname={pathname}
      stores={stores}
      storeId={storeId}
      from={range?.from}
      to={range?.to}
      maxDate={today ?? undefined}
      presets={presets}
      carriedComparison={single(params, "compare")}
      comparisonLabel={comparisonLabel}
      dates={dates && today !== null}
      comparison={comparison?.mode}
      fixedStore={fixedStore}
    />
  );
}
