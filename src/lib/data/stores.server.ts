/**
 * The store picker's roster, shared by every view's filter bar, and the store
 * time zone each report or export uses. Names and domains come from dim_stores; reporting
 * currency comes from verified app.config.ts settings. There is no cross-store total anywhere in
 * the example.
 */
import "server-only";
import { cache } from "react";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { isCurrency, isTimeZone } from "@/lib/format";
import { SAMPLE_STORES } from "@/lib/sample/stores";
import { queryOrderTimeZone, queryStoreRoster } from "./store-roster.server";
import { WarehouseError } from "./warehouse-error";

/**
 * `timeZone` is dim_stores.store_timezone, when this runtime knows that zone.
 * `currency` is dim_stores.store_currency_code, trimmed and uppercased, when
 * Intl accepts it. This is nominal store metadata, not a report currency.
 * A missing or unrecognized code is null.
 */
export type StoreOption = {
  id: string;
  label: string;
  brand: string | null;
  timeZone: string | null;
  currency: string | null;
};

/** An ISO code this runtime can use to label money, or null. */
function currencyCode(code: string | null | undefined): string | null {
  const normalized = code?.trim().toUpperCase() ?? "";
  return normalized !== "" && isCurrency(normalized) ? normalized : null;
}

/** Optional website metadata is a display fallback, never a link or a network request. */
function storeDomain(website: string | null): string | null {
  const value = website?.trim();
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `https://${value.replace(/^\/\//, "")}`);
    if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return null;
    const domain = url.hostname.replace(/^www\./, "");
    return domain.includes(".") ? domain : null;
  } catch {
    // A malformed optional website must not make a store unavailable.
    return null;
  }
}

/** Verified reporting currency, never inferred from nominal warehouse metadata. */
export function reportingCurrency(storeId: string, mode: "sample" | "live"): string | null {
  return currencyCode(
    mode === "sample"
      ? SAMPLE_STORES.find((store) => store.id === storeId)?.currency
      : Object.hasOwn(appConfig.reportingCurrencies, storeId)
        ? appConfig.reportingCurrencies[storeId]
        : appConfig.currency,
  );
}

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
      storeDomain(store.store_url) ||
      store.sm_store_id,
    brand: store.brand_name?.trim() || null,
    timeZone: store.store_timezone && isTimeZone(store.store_timezone) ? store.store_timezone : null,
    currency: currencyCode(store.store_currency_code),
  }));
});

/**
 * Store time zones this server has resolved. These are store configuration,
 * not viewer data. Reusing them for an hour lets a report whose
 * link names its store start its queries without waiting for the store list,
 * while a changed zone or daylight-saving change in an order offset
 * still applies within the hour. The live report currency is resolved from
 * app.config.ts separately, so nominal store metadata never chooses its label.
 */
const knownStores = new Map<string, { zone: string; until: number }>();
const REMEMBER_MS = 60 * 60 * 1000;

/**
 * The store's zone from one list read. The zone is
 * dim_stores.store_timezone, or the offset SourceMedium applied to the store's
 * recent orders when that is missing, the store is not listed, or the store
 * list failed. Null for an unlisted store with neither zone. Never a guess: a
 * listed store with neither zone throws, as does a failed store list.
 */
async function storeFacts(storeId: string, stores?: StoreOption[]): Promise<{ zone: string } | null> {
  const access = await requireViewer({ storeId });
  const key = `${access.mode}|${storeId}`;
  const known = knownStores.get(key);
  if (known && known.until > Date.now()) return { zone: known.zone };
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
    const facts = { zone };
    knownStores.set(key, { ...facts, until: Date.now() + REMEMBER_MS });
    return facts;
  }
  if (failure) throw failure;
  if (!store) return null;
  throw new WarehouseError("time_zone_unknown", { relation: "dim_stores", column: "store_timezone" });
}

/**
 * The store's SourceMedium time zone, which every warehouse date for the
 * store uses. See storeFacts for how it is chosen.
 */
export async function storeTimeZone(storeId: string, stores?: StoreOption[]): Promise<string | null> {
  const facts = await storeFacts(storeId, stores);
  return facts?.zone ?? null;
}

export type ReportStore =
  | { status: "ready"; storeId: string; timeZone: string; currency: string | null }
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
  const access = await requireViewer(supplied === undefined ? undefined : { storeId: supplied });
  const requested = (supplied ?? access.storeId)?.slice(0, 200) || null;
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
    const facts = await storeFacts(storeId, stores ?? undefined);
    return facts === null
      ? { status: "no_date", storeId, error: null }
      : {
          status: "ready",
          storeId,
          timeZone: facts.zone,
          currency: reportingCurrency(storeId, access.mode),
        };
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return { status: "no_date", storeId, error };
  }
}
