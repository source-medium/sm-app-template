/**
 * The store picker's roster, shared by every view's filter bar, and the store
 * time zone each report or export uses. Names, domains and reporting
 * currencies come from dim_stores; app.config.ts can explicitly override a
 * label. There is no cross-store total anywhere in the example.
 */
import "server-only";
import { cache } from "react";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { isCurrency, isTimeZone } from "@/lib/format";
import { SAMPLE_STORES } from "@/lib/sample/stores";
import { recallStoreFacts, rememberStoreFacts, type StoreFacts } from "./store-facts.server";
import { queryOrderTimeZone, queryStoreRoster } from "./store-roster.server";
import { WarehouseError } from "./warehouse-error";

/**
 * `timeZone` is dim_stores.store_timezone, when this runtime knows that zone.
 * `currency` is dim_stores.store_currency_code, trimmed and uppercased, when
 * Intl accepts it. This is the source of truth for the store’s reporting currency.
 * A missing or unrecognized code is null.
 */
export type StoreOption = {
  id: string;
  label: string;
  domain: string | null;
  logoUrl: string | null;
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

/** Only load configured HTTPS logos, without credentials or a report referrer. */
function storeLogo(logo: string | null): string | null {
  if (!logo?.trim()) return null;
  try {
    const url = new URL(logo.trim());
    return url.protocol === "https:" && !url.username && !url.password ? url.href : null;
  } catch {
    return null;
  }
}

/** Store metadata supplies the reporting unit; explicit app customizations retain precedence. */
export function reportingCurrency(
  store: Pick<StoreOption, "id" | "currency">,
  access: { mode: "sample" | "live" },
): string | null {
  if (access.mode === "sample") return currencyCode(store.currency);
  if (Object.hasOwn(appConfig.reportingCurrencies, store.id))
    return currencyCode(appConfig.reportingCurrencies[store.id]);
  return currencyCode(appConfig.currency) ?? currencyCode(store.currency);
}

/** What app.config.ts establishes about live money labels, as reportingCurrency() will apply it. */
export type ReportingCurrencyConfig = {
  /** The deployment's validated code, or null when unset or unrecognized. */
  currency: string | null;
  /** A configured deployment code Intl does not accept; it is ignored, so store metadata applies. */
  invalidCurrency: string | null;
  /** Stores with their own validated code. */
  labeledStores: number;
  /** Stores explicitly set to null or to an unrecognized code: they show no currency whatever the default. */
  unlabeledStores: number;
};

export function reportingCurrencyConfig(
  config: Pick<typeof appConfig, "currency" | "reportingCurrencies"> = appConfig,
): ReportingCurrencyConfig {
  const overrides = Object.values(config.reportingCurrencies);
  const currency = currencyCode(config.currency);
  return {
    currency,
    invalidCurrency: config.currency && currency === null ? config.currency : null,
    labeledStores: overrides.filter((code) => currencyCode(code) !== null).length,
    unlabeledStores: overrides.filter((code) => currencyCode(code) === null).length,
  };
}

export const loadStores = cache(async (): Promise<StoreOption[]> => {
  const access = await requireViewer();
  if (access.mode === "sample")
    return SAMPLE_STORES.filter((store) => access.storeId === null || store.id === access.storeId).map((store) => ({
      ...store,
    }));
  const { stores } = await queryStoreRoster(access.warehouse, access.storeId);
  return stores.map((store) => {
    const domain = storeDomain(store.store_url);
    return {
      id: store.sm_store_id,
      label:
        (Object.hasOwn(appConfig.storeLabels, store.sm_store_id) && appConfig.storeLabels[store.sm_store_id]?.trim()) ||
        store.store_name?.trim() ||
        domain ||
        store.sm_store_id,
      domain,
      logoUrl: storeLogo(store.store_logo_url),
      brand: store.brand_name?.trim() || null,
      timeZone: store.store_timezone && isTimeZone(store.store_timezone) ? store.store_timezone : null,
      currency: currencyCode(store.store_currency_code),
    };
  });
});

/**
 * The store's zone and dim_stores currency from one list read, remembered
 * (src/lib/data/store-facts.server.ts) unless this request is a Refresh. The
 * zone is dim_stores.store_timezone, or the offset SourceMedium applied to the
 * store's recent orders when that is missing, the store is not listed, or the
 * store list failed. Null for an unlisted store with neither zone. Never a
 * guess: a listed store with neither zone throws, as does a failed store list.
 * Only facts read with a successful store list are remembered, so a failed
 * list never pins a store unlabeled.
 */
async function storeFacts(storeId: string, stores?: StoreOption[]): Promise<StoreFacts | null> {
  const access = await requireViewer({ storeId });
  const key = `${access.mode}|${access.mode === "live" ? access.warehouse.applicationId : ""}|${storeId}`;
  const known = access.request.bypassCache ? null : recallStoreFacts(key);
  if (known) return known;
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
    const facts = { zone, currency: store?.currency ?? null };
    if (listed) rememberStoreFacts(key, facts);
    return facts;
  }
  if (failure) throw failure;
  if (!store) return null;
  throw new WarehouseError("time_zone_unknown", { relation: "dim_stores", column: "store_timezone" });
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
          currency: reportingCurrency({ id: storeId, currency: facts.currency }, access),
        };
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return { status: "no_date", storeId, error };
  }
}
