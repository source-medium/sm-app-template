/**
 * The report's filter bar: the store picker from the store list, and the
 * dates and comparison the page applied. It owns its Suspense boundary, so
 * every report state renders the same shape and a navigation keeps the report
 * form mounted; a choice made while the next page loads still submits.
 */
import { Suspense } from "react";
import { ErrorState } from "@/components/patterns/data-states";
import { StoreSwitcher } from "./store-switcher";
import { FilterBar } from "@/components/shell/filter-bar";
import { Skeleton } from "@/components/ui/skeleton";
import type { StoreOption } from "@/lib/data/stores.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import type { ComparisonPlan } from "@/lib/comparison";
import { datePresets, single, withParams, type DateRange, type SearchParams } from "@/lib/filters";
import { formatDateRange } from "@/lib/format";

export type ReportFilterBarProps = {
  roster: Promise<StoreOption[]>;
  storeId: string;
  pathname: string;
  params: SearchParams;
  /** Null when the store's date is unknown, which hides the date controls. */
  range: DateRange | null;
  today: string | null;
  comparisonLabel?: string;
  dates: boolean;
  maxDays?: number;
  /** Present on reports that compare periods; its two slots are the comparison selects. */
  plan?: ComparisonPlan;
  fixedStore: boolean;
  allStores?: boolean;
};

export function ReportFilterBar(props: ReportFilterBarProps) {
  return (
    <Suspense fallback={<Skeleton className="h-[4.75rem] rounded-xl" />}>
      <RosterFilterBar {...props} />
    </Suspense>
  );
}

/** The filter bar once the store list arrives; says so when the URL names a store the warehouse does not have. */
async function RosterFilterBar({ roster, ...props }: ReportFilterBarProps) {
  let stores: StoreOption[];
  try {
    stores = await roster;
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return <ErrorState title={error.title} remedy={error.remedy} detail={error.detail} />;
  }
  if (stores.some((store) => store.id === props.storeId)) return <StoreFilterBar stores={stores} {...props} />;
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
      {stores[0] && <StoreFilterBar stores={stores} {...props} />}
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
  plan,
  fixedStore,
  allStores,
  maxDays,
}: Omit<ReportFilterBarProps, "roster"> & { stores: StoreOption[] }) {
  const presets =
    dates && today !== null && range !== null
      ? datePresets(today, maxDays).map(({ label, range: preset }) => ({
          label,
          href: withParams(pathname, params, { store: storeId, ...preset, cursor: null, order: null }),
          active: range.from === preset.from && range.to === preset.to,
        }))
      : [];
  return (
    <>
      <StoreSwitcher
        stores={stores}
        storeId={storeId}
        pathname={pathname}
        params={{ ...params, store: storeId, ...range }}
        fixedStore={fixedStore}
        allStores={allStores}
      />
      <FilterBar
        key={`${storeId}|${range?.from}|${range?.to}|${plan?.slots[0].mode}|${plan?.slots[1].mode}`}
        pathname={pathname}
        storeId={storeId}
        from={range?.from}
        to={range?.to}
        maxDate={today ?? undefined}
        maxDays={maxDays}
        presets={presets}
        carriedComparison={single(params, "compare")}
        carriedComparison2={single(params, "compare2")}
        comparisonLabel={comparisonLabel}
        dates={dates && today !== null}
        comparison={plan?.slots[0].mode}
        comparison2={plan?.slots[1].mode}
        rangeLabel={range ? formatDateRange(range) : undefined}
      />
    </>
  );
}
