/**
 * The store picker's roster, shared by every view's filter bar. Labels come
 * from app.config.ts. There is no cross-store total anywhere in the example.
 */
import "server-only";
import { cache } from "react";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { SAMPLE_STORES } from "@/lib/sample/stores";
import { queryStoreRoster } from "./store-roster.server";

export type StoreOption = { id: string; label: string };

export const loadStores = cache(async (): Promise<StoreOption[]> => {
  const access = await requireViewer();
  if (access.mode === "sample") return SAMPLE_STORES.map((store) => ({ ...store }));
  const ids = await queryStoreRoster(access.warehouse);
  return ids.map((id) => ({ id, label: appConfig.storeLabels[id] ?? id }));
});
