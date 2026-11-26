import "server-only";
import { cache } from "react";
import { appConfig } from "@/app.config";
import { requireViewer } from "@/lib/auth/require-viewer";
import { VALID_SALES_CHANNELS } from "@/lib/sales-channels";
import { queryRetention, queryRetentionChannels, queryRetentionSegments } from "./bigquery";
import { sampleRetention, sampleRetentionChannels, sampleRetentionSegments } from "./sample";
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

/** The store's acquisition channels in the observation window, read once per request. */
export const getRetentionChannels = cache(async (storeId: string, asOf: string): Promise<string[]> => {
  const access = await requireViewer({ storeId });
  return access.mode === "live"
    ? queryRetentionChannels({ storeId, asOf })
    : sampleRetentionChannels({ storeId, asOf });
});

/**
 * The channel cohorts start on when a link names none: the configured default
 * channel the store has cohorts for, else the first it has in the catalog's
 * valid-channel order (Online DTC first), else its first. Never guessed from size.
 */
export function defaultAcquisitionChannel(channels: readonly string[]): string {
  return (
    [...appConfig.defaultSalesChannels, ...VALID_SALES_CHANNELS].find((channel) => channels.includes(channel)) ??
    channels[0] ??
    "online_dtc"
  );
}

export async function getRetentionSegments(filters: RetentionSegmentFilters): Promise<RetentionSegments> {
  const access = await requireViewer({ storeId: filters.storeId });
  if (!filters.dimension || filters.dimension === "no_filters") return { values: [], truncated: false };
  return access.mode === "live" ? queryRetentionSegments(filters) : sampleRetentionSegments(filters);
}
