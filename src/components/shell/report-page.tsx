/**
 * The frame every report view shares: title, the store and date filters
 * parsed from the URL, refresh and share controls, and a freshness footer.
 * Each DataRegion timestamps its own successful load.
 *
 * A view passes a render function that receives the applied filters.
 *
 * When the URL already names a store, the view's queries start at once,
 * alongside the store list, instead of waiting for it: each is a BigQuery
 * job, so running them together saves a round trip on every page. Only a
 * first visit with no store chosen waits for the list to pick one.
 */
import { Suspense } from "react";
import { appConfig } from "@/app.config";
import { EmptyState, ErrorState } from "@/components/patterns/data-states";
import { FilterBar } from "@/components/shell/filter-bar";
import { CopyReportLink } from "@/components/shell/copy-report-link";
import { RefreshReport } from "@/components/shell/refresh-report";
import { Skeleton } from "@/components/ui/skeleton";
import { requireViewer } from "@/lib/auth/require-viewer";
import { loadStores, type StoreOption } from "@/lib/data/stores.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { parseComparison, type Comparison } from "@/lib/comparison";
import {
  datePresets,
  dateRangeIssue,
  parseDateRange,
  single,
  todayUtc,
  withParams,
  type DateRange,
  type ReportFilters,
  type SearchParams,
} from "@/lib/filters";

export type ReportContext = { filters: ReportFilters; params: SearchParams; comparison?: Comparison };

type FilterBarProps = {
  pathname: string;
  params: SearchParams;
  range: DateRange;
  now: Date;
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
  children: (context: ReportContext) => React.ReactNode;
}) {
  const access = await requireViewer();
  const suppliedStore = single(params, "store");
  if (suppliedStore !== undefined) await requireViewer({ storeId: suppliedStore });
  const requested = (suppliedStore ?? access.storeId)?.slice(0, 200);
  const now = new Date();
  const range = parseDateRange(params, now);
  const issue = dates ? dateRangeIssue(params, now) : null;
  const correction = issue ? (
    <ErrorState
      title="Check the date range"
      remedy={`${issue} The controls show a suggested range. Apply it or choose another range to load the report.`}
    />
  ) : null;
  const comparison = comparisons && dates ? parseComparison(params, range) : undefined;
  if (comparison) params = { ...params, compare: comparison.mode };
  const roster = loadStores();
  // Handled where it is awaited; this keeps an early failure from being reported as unhandled.
  roster.catch(() => undefined);
  const barProps: FilterBarProps = {
    pathname,
    params,
    range,
    now,
    comparisonLabel,
    dates,
    comparison,
    fixedStore: access.storeId !== null,
  };

  function header(storeId?: string) {
    const shareHref = storeId ? withParams(pathname, params, { store: storeId, ...(dates ? range : {}) }) : null;
    return (
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
          <p className="text-xs text-muted-foreground">
            {appConfig.currency ? `Reporting currency: ${appConfig.currency}` : "Amounts in reporting currency"}
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <RefreshReport />
          {shareHref && <CopyReportLink key={shareHref} href={shareHref} />}
        </div>
      </header>
    );
  }
  const footer = (
    <footer className="border-t pt-4 text-xs text-muted-foreground">
      {access.mode === "sample"
        ? "Synthetic sample data for demonstration; not from any warehouse."
        : "Data freshness unknown."}
      {dates && " Dates are calendar dates as published in the warehouse."}
      {dates && range.to === todayUtc(now) && " Today may be incomplete."}
      {appConfig.currency && <span className="mt-1 block">Reporting currency: {appConfig.currency}.</span>}
    </footer>
  );

  if (requested) {
    return (
      <div className="flex flex-col gap-4">
        {header(requested)}
        <Suspense fallback={<Skeleton className="h-[4.75rem] rounded-lg" />}>
          <RosterFilterBar roster={roster} storeId={requested} {...barProps} />
        </Suspense>
        {correction ?? children({ filters: { storeId: requested, range }, params, comparison })}
        {footer}
      </div>
    );
  }

  let stores: StoreOption[];
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
  return (
    <div className="flex flex-col gap-4">
      {header(first.id)}
      <StoreFilterBar stores={stores} storeId={first.id} {...barProps} />
      {/* Links built from params now name the store, so the next page runs its queries in parallel. */}
      {correction ??
        children({ filters: { storeId: first.id, range }, params: { ...params, store: first.id }, comparison })}
      {footer}
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
            ? "The configured store is not one this app lists. Any data it has still shows below; ask the app owner to check APP_STORE_ID and run pnpm diagnose."
            : "The link names a store this app does not list. Any data it has still shows below; choose a listed store to continue."
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
  now,
  comparisonLabel,
  dates,
  comparison,
  fixedStore,
}: FilterBarProps & { stores: StoreOption[]; storeId: string }) {
  const presets = datePresets(now).map(({ label, range: preset }) => {
    return {
      label,
      href: withParams(pathname, params, { store: storeId, ...preset, cursor: null, order: null }),
      active: range.from === preset.from && range.to === preset.to,
    };
  });
  return (
    <FilterBar
      key={`${storeId}|${range.from}|${range.to}|${comparison?.mode}`}
      pathname={pathname}
      stores={stores}
      storeId={storeId}
      from={range.from}
      to={range.to}
      maxDate={todayUtc(now)}
      presets={dates ? presets : []}
      carriedComparison={single(params, "compare")}
      comparisonLabel={comparisonLabel}
      dates={dates}
      comparison={comparison?.mode}
      fixedStore={fixedStore}
    />
  );
}
