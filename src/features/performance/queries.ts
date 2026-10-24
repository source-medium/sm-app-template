import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import type { TimeGrain } from "@/lib/time-grain";
import { sampleSummaryChannels } from "@/lib/sample/executive-summary";
import { queryBusiness, queryPlatforms, queryPerformanceChannels } from "./bigquery";
import { sampleBusiness, samplePlatforms } from "./sample";

export type PerformanceFilters = ReportFilters & { grain: TimeGrain; channel: string | null };
export async function getBusiness(filters: PerformanceFilters) {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryBusiness(filters) : sampleBusiness(filters);
}
export async function getPlatforms(filters: PerformanceFilters) {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryPlatforms(filters) : samplePlatforms(filters);
}
export async function getPerformanceChannels(filters: PerformanceFilters) {
  const access = await requireViewer({ storeId: filters.storeId });
  // Sample platform channels are a subset of the summary's, so it lists every option, as the live union does.
  return access.mode === "live"
    ? queryPerformanceChannels(filters)
    : sampleSummaryChannels(filters.storeId, filters.range);
}
