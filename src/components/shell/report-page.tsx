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
  addDays,
  parseDateRange,
  single,
  todayUtc,
  withParams,
  type DateRange,
  type ReportFilters,
  type SearchParams,
} from "@/lib/filters";

const PRESET_DAYS = [7, 28, 90];

export type ReportContext = { filters: ReportFilters; params: SearchParams; comparison?: Comparison };

type FilterBarProps = {
  pathname: string;
  params: SearchParams;
  range: DateRange;
  now: Date;
  preserve: string[];
  dates: boolean;
  comparison?: Comparison;
};

export async function ReportPage({
  title,
  description,
  pathname,
  params,
  preserve = [],
  dates = true,
  comparisons = false,
  children,
}: {
  title: string;
  description: string;
  pathname: string;
  params: SearchParams;
  /** URL parameters (besides store and dates) that survive a filter change. */
  preserve?: string[];
  /** False for current-state views (such as inventory) that have no date range. */
  dates?: boolean;
  /** Opt in only after the feature queries and presents a comparison period. */
  comparisons?: boolean;
  children: (context: ReportContext) => React.ReactNode;
}) {
  const access = await requireViewer();
  const now = new Date();
  const range = parseDateRange(params, now);
  const comparison = comparisons && dates ? parseComparison(params, range) : undefined;
  if (comparison) params = { ...params, compare: comparison.mode };
  const roster = loadStores();
  // Handled where it is awaited; this keeps an early failure from being reported as unhandled.
  roster.catch(() => undefined);
  const barProps: FilterBarProps = { pathname, params, range, now, preserve, dates, comparison };

  function header(storeId?: string) {
    const shareHref = storeId ? withParams(pathname, params, { store: storeId, ...(dates ? range : {}) }) : null;
    return (
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          <p className="max-w-prose text-sm text-muted-foreground">{description}</p>
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
    </footer>
  );

  const requested = single(params, "store")?.slice(0, 200);
  if (requested) {
    return (
      <div className="flex flex-col gap-6">
        {header(requested)}
        <Suspense fallback={<Skeleton className="h-[4.75rem] rounded-lg" />}>
          <RosterFilterBar roster={roster} storeId={requested} {...barProps} />
        </Suspense>
        {children({ filters: { storeId: requested, range }, params, comparison })}
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
      <div className="flex flex-col gap-6">
        {header()}
        <ErrorState title={error.title} remedy={error.remedy} detail={error.detail} />
      </div>
    );
  }
  const first = stores[0];
  if (!first) {
    return (
      <div className="flex flex-col gap-6">
        {header()}
        <EmptyState message="This warehouse has no stores with data yet." />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {header(first.id)}
      <StoreFilterBar stores={stores} storeId={first.id} {...barProps} />
      {/* Links built from params now name the store, so the next page runs its queries in parallel. */}
      {children({ filters: { storeId: first.id, range }, params: { ...params, store: first.id }, comparison })}
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
        title="That store is not in this warehouse"
        remedy="The link names a store this app cannot find. Choose a store below."
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
  preserve,
  dates,
  comparison,
}: FilterBarProps & { stores: StoreOption[]; storeId: string }) {
  const yesterday = addDays(todayUtc(now), -1);
  const presets = PRESET_DAYS.map((days) => {
    const from = addDays(yesterday, -(days - 1));
    return {
      label: `Last ${days} days`,
      href: withParams(pathname, params, { store: storeId, from, to: yesterday, cursor: null, order: null }),
      active: range.from === from && range.to === yesterday,
    };
  });
  const preserved: Record<string, string> = {};
  for (const name of [...preserve, "compare"]) {
    const value = single(params, name);
    if (value !== undefined) preserved[name] = value;
  }
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
      preserved={preserved}
      dates={dates}
      comparison={comparison?.mode}
    />
  );
}
