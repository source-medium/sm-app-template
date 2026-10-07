/**
 * The store picker's roster, shared by every view's filter bar. Labels come
 * from dim_stores, with optional app.config.ts overrides. There is no
 * cross-store total anywhere in the example.
 */
import "server-only";
import { cache } from "react";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { SAMPLE_STORES } from "@/lib/sample/stores";
import { queryStoreRoster } from "./store-roster.server";

export type StoreOption = { id: string; label: string; brand: string | null };

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
  }));
});
