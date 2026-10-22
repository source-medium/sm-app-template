import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import type { TimeGrain } from "@/lib/time-grain";
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
  return access.mode === "live" ? queryPerformanceChannels(filters) : ["Online DTC", "Amazon"];
}
