/**
 * The frame every report view shares: title, the store and date filters
 * parsed from the URL, the view's regions, and a footer that says when the
 * data was queried and that its freshness is unknown.
 *
 * A view passes a render function that receives the applied filters.
 */
import { FilterBar } from "@/components/shell/filter-bar";
import { EmptyState, ErrorState } from "@/components/patterns/data-states";
import { requireViewer } from "@/lib/auth/require-viewer";
import { loadStores, type StoreOption } from "@/lib/data/stores.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import {
  addDays,
  parseDateRange,
  parseStore,
  todayUtc,
  withParams,
  type ReportFilters,
  type SearchParams,
} from "@/lib/filters";
import { formatInstant } from "@/lib/format";

const PRESET_DAYS = [7, 28, 90];

export type ReportContext = { filters: ReportFilters; store: StoreOption; params: SearchParams };

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
  const header = (
    <header className="flex flex-col gap-1">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="text-sm text-muted-foreground">{description}</p>
    </header>
  );

  let stores: StoreOption[];
  try {
    stores = await loadStores();
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState title={error.title} remedy={error.remedy} detail={error.detail} />
      </div>
    );
  }

  const storeId = parseStore(
    params,
    stores.map((store) => store.id),
  );
  const store = stores.find((item) => item.id === storeId);
  if (!store) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <EmptyState message="This warehouse has no stores with data yet." />
      </div>
    );
  }

  const range = parseDateRange(params, now);
  const yesterday = addDays(todayUtc(now), -1);
  const presets = PRESET_DAYS.map((days) => {
    const from = addDays(yesterday, -(days - 1));
    return {
      label: `Last ${days} days`,
      href: withParams(pathname, params, { from, to: yesterday, cursor: null, order: null }),
      active: range.from === from && range.to === yesterday,
    };
  });
  const preserved: Record<string, string> = {};
  for (const name of preserve) {
    const value = params[name];
    if (typeof value === "string") preserved[name] = value;
  }

  return (
    <div className="flex flex-col gap-6">
      {header}
      <FilterBar
        pathname={pathname}
        stores={stores}
        storeId={store.id}
        from={range.from}
        to={range.to}
        maxDate={todayUtc(now)}
        presets={presets}
        preserved={preserved}
      />
      {children({ filters: { storeId: store.id, range }, store, params })}
      <footer className="border-t pt-4 text-xs text-muted-foreground">
        {access.mode === "sample"
          ? "Synthetic sample data for demonstration; not from any warehouse."
          : `Queried at ${formatInstant(now.toISOString())} · Data freshness unknown.`}{" "}
        Dates are calendar dates as published in the warehouse.
      </footer>
    </div>
  );
}
