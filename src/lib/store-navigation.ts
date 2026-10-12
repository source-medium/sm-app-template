import { appConfig } from "@/app.config";
import { single, withParams, type SearchParams } from "./filters";

export const STORE_SWITCHER_SLOT = "report-store-switcher";
export const allStoresPath = () => appConfig.nav.find((item) => item.scope === "all-stores")?.href;
export const storeReportPath = () => appConfig.nav.find((item) => item.scope !== "all-stores")?.href;

/** Applied report state only. Row identities and searches belong to the old store. */
export function switchStoreHref(pathname: string, params: SearchParams, storeId: string): string {
  return withParams(pathname, params, {
    store: storeId,
    campaign: null,
    order: null,
    cursor: null,
    q: null,
    acquisition_segment: null,
    segment_search: null,
  });
}

/** A portfolio compares the same dates across stores, independent of report-specific filters. */
export function allStoresHref(pathname: string, params: SearchParams): string {
  return withParams(
    pathname,
    {},
    Object.fromEntries(["store", "from", "to", "compare"].map((key) => [key, single(params, key) ?? null])),
  );
}
