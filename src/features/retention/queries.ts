import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { queryRetention, queryRetentionSegments } from "./bigquery";
import { sampleRetention, sampleRetentionSegments } from "./sample";
import type { RetentionRowData } from "./rows";
import type { AcquisitionDimension } from "./filters";

export type RetentionFilters = {
  storeId: string;
  asOf: string;
  dimension?: AcquisitionDimension;
  segment?: string | null;
};
export type RetentionSegmentFilters = RetentionFilters & { channel: string; search: string };
export type RetentionSegments = { values: string[]; truncated: boolean };
export async function getRetention(filters: RetentionFilters): Promise<RetentionRowData[]> {
  const access = await requireViewer({ storeId: filters.storeId });
  if (filters.dimension && filters.dimension !== "no_filters" && !filters.segment) return [];
  return access.mode === "live" ? queryRetention(filters) : sampleRetention(filters);
}

export async function getRetentionSegments(filters: RetentionSegmentFilters): Promise<RetentionSegments> {
  const access = await requireViewer({ storeId: filters.storeId });
  if (!filters.dimension || filters.dimension === "no_filters") return { values: [], truncated: false };
  return access.mode === "live" ? queryRetentionSegments(filters) : sampleRetentionSegments(filters);
}
