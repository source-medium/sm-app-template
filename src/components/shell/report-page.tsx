/**
 * The frame every report view shares: title, the store and date filters
 * parsed from the URL, the view's regions, and a footer that says when the
 * data was queried and that its freshness is unknown.
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
import { Skeleton } from "@/components/ui/skeleton";
import { requireViewer } from "@/lib/auth/require-viewer";
import { loadStores, type StoreOption } from "@/lib/data/stores.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
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
import { formatInstant } from "@/lib/format";

const PRESET_DAYS = [7, 28, 90];

export type ReportContext = { filters: ReportFilters; params: SearchParams };

type FilterBarProps = {
  pathname: string;
  params: SearchParams;
  range: DateRange;
  now: Date;
  preserve: string[];
};

export async function ReportPage({
  title,
  description,
  pathname,
  params,
  preserve = [],
  children,
}: {
  title: string;
  description: string;
  pathname: string;
  params: SearchParams;
  /** URL parameters (besides store and dates) that survive a filter change. */
  preserve?: string[];
  children: (context: ReportContext) => React.ReactNode;
}) {
  const access = await requireViewer();
  const now = new Date();
  const range = parseDateRange(params, now);
  const roster = loadStores();
  // Handled where it is awaited; this keeps an early failure from being reported as unhandled.
  roster.catch(() => undefined);
  const barProps: FilterBarProps = { pathname, params, range, now, preserve };

  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
  );
  const footer = (
    <footer className="border-t pt-4 text-xs text-muted-foreground">
      {access.mode === "sample"
        ? "Synthetic sample data for demonstration; not from any warehouse."
        : `Queried at ${formatInstant(now.toISOString())} · Data freshness unknown.`}{" "}
      Dates are calendar dates as published in the warehouse.
    </footer>
  );

  const requested = single(params, "store")?.slice(0, 200);
  if (requested) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <Suspense fallback={<Skeleton className="h-[4.75rem] rounded-lg" />}>
          <RosterFilterBar roster={roster} storeId={requested} {...barProps} />
        </Suspense>
        {children({ filters: { storeId: requested, range }, params })}
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
        {header}
        <ErrorState title={error.title} remedy={error.remedy} detail={error.detail} />
      </div>
    );
  }
  const first = stores[0];
  if (!first) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState message="This warehouse has no stores with data yet." />
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-6">
      {header}
      <StoreFilterBar stores={stores} storeId={first.id} {...barProps} />
      {/* Links built from params now name the store, so the next page runs its queries in parallel. */}
      {children({ filters: { storeId: first.id, range }, params: { ...params, store: first.id } })}
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
      {stores[0] && <StoreFilterBar stores={stores} storeId={stores[0].id} {...props} />}
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
  for (const name of preserve) {
    const value = single(params, name);
    if (value !== undefined) preserved[name] = value;
  }
  return (
    <FilterBar
      pathname={pathname}
      stores={stores}
      storeId={storeId}
      from={range.from}
      to={range.to}
      maxDate={todayUtc(now)}
      presets={presets}
      preserved={preserved}
    />
  );
}
