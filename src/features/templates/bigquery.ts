import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { loadReportMetadata } from "@/lib/data/report-metadata.server";
import { PRESET_RELATIONS } from "./presets";

/** What the published dictionary says about every preset's sources for the store, in one metadata request. */
export async function queryPresetSources(storeId: string) {
  await requireViewer({ live: true, storeId });
  return loadReportMetadata(storeId, PRESET_RELATIONS);
}
