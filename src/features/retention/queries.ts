import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { queryRetention } from "./bigquery";
import { sampleRetention } from "./sample";
import type { RetentionRowData } from "./rows";

export type RetentionFilters = { storeId: string; asOf: string };
export async function getRetention(filters: RetentionFilters): Promise<RetentionRowData[]> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryRetention(filters) : sampleRetention(filters);
}
