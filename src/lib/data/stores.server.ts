/**
 * The store picker's roster, shared by every view's filter bar, and the store
 * and time zone each report or export uses. Labels come from dim_stores, with
 * optional app.config.ts overrides. There is no cross-store total anywhere in
 * the example.
 */
import "server-only";
import { cache } from "react";
import { appConfig } from "@/app.config";
import { requestedStore, requireViewer } from "@/lib/auth/require-viewer";
import { isTimeZone } from "@/lib/format";
import { SAMPLE_STORES } from "@/lib/sample/stores";
import { queryOrderTimeZone, queryStoreRoster } from "./store-roster.server";
import { WarehouseError } from "./warehouse-error";

/** `timeZone` is dim_stores.store_timezone, when it is a zone this runtime knows. */
export type StoreOption = { id: string; label: string; brand: string | null; timeZone: string | null };

export const loadStores = cache(async (): Promise<StoreOption[]> => {
  const access = await requireViewer();
  if (access.mode === "sample")
    return SAMPLE_STORES.filter((store) => access.storeId === null || store.id === access.storeId).map((store) => ({
      ...store,
    }));
  const { stores } = await queryStoreRoster(access.warehouse, access.storeId);
  return stores.map((store) => ({
    id: store.sm_store_id,
    label:
      (Object.hasOwn(appConfig.storeLabels, store.sm_store_id) && appConfig.storeLabels[store.sm_store_id]?.trim()) ||
      store.store_name?.trim() ||
      store.sm_store_id,
    brand: store.brand_name?.trim() || null,
    timeZone: store.store_timezone && isTimeZone(store.store_timezone) ? store.store_timezone : null,
  }));
});

/**
 * Time zones this server has resolved, by store. A zone is store
 * configuration, not viewer data. Reusing it for an hour lets a report whose
 * link names its store start its queries without waiting for the store list,
 * while a changed zone or a daylight-saving change in an order offset still
 * applies within the hour.
 */
const knownTimeZones = new Map<string, { zone: string; until: number }>();
const REMEMBER_MS = 60 * 60 * 1000;

/**
 * The store's SourceMedium time zone, which every warehouse date for the
 * store uses: dim_stores.store_timezone, or the offset SourceMedium applied to
 * the store's recent orders when that is missing, the store is not listed, or
 * the store list failed. Null for an unlisted store with neither. Never a
 * guess: a listed store with neither throws, as does a failed store list.
 */
export async function storeTimeZone(storeId: string, stores?: StoreOption[]): Promise<string | null> {
  const access = await requireViewer({ storeId });
  const key = `${access.mode}|${storeId}`;
  const known = knownTimeZones.get(key);
  if (known && known.until > Date.now()) return known.zone;
  let listed: StoreOption[] | null = null;
  let failure: WarehouseError | null = null;
  try {
    listed = await (stores ?? loadStores());
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    failure = error;
  }
  const store = listed?.find((option) => option.id === storeId);
  const zone = store?.timeZone ?? (access.mode === "live" ? await queryOrderTimeZone(access.warehouse, storeId) : null);
  if (zone) {
    knownTimeZones.set(key, { zone, until: Date.now() + REMEMBER_MS });
    return zone;
  }
  if (failure) throw failure;
  if (!store) return null;
  throw new WarehouseError("time_zone_unknown", { relation: "dim_stores", column: "store_timezone" });
}

export type ReportStore =
  /** `stores` is the store list when choosing the store needed it, else null. */
  | { status: "ready"; storeId: string; timeZone: string; stores: StoreOption[] | null }
  /** No store to show: the list failed (`error`) or has none (null). */
  | { status: "no_store"; error: WarehouseError | null }
  /** The store's dates are unknown: a lookup failed (`error`), or it is unlisted without recent orders (null). */
  | { status: "no_date"; storeId: string; error: WarehouseError | null };

/**
 * The store a report or export shows, and its time zone: the URL's store
 * (`?store=`) when the viewer may see it, otherwise the fixed or first listed
 * store. A store the viewer may not see throws StoreAccessError before any
 * query. The store list is read only when needed, through loadStores(), which
 * a page shares with its filter bar.
 */
export async function resolveReportStore(supplied: string | undefined): Promise<ReportStore> {
  const requested = await requestedStore(supplied);
  let stores: StoreOption[] | null = null;
  if (requested === null) {
    try {
      stores = await loadStores();
    } catch (error) {
      if (!(error instanceof WarehouseError)) throw error;
      return { status: "no_store", error };
    }
  }
  const storeId = requested ?? stores?.[0]?.id;
  if (!storeId) return { status: "no_store", error: null };
  try {
    const timeZone = await storeTimeZone(storeId, stores ?? undefined);
    return timeZone === null
      ? { status: "no_date", storeId, error: null }
      : { status: "ready", storeId, timeZone, stores };
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return { status: "no_date", storeId, error };
  }
}
