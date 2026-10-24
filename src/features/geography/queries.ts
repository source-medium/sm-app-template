import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import type { OrderDateBasis } from "@/lib/order-scope";
import { queryGeography } from "./bigquery";
import { sampleGeography } from "./sample";
import type { GeographyRow } from "./rows";
import type { BaselineRanges } from "@/lib/comparison";

export type GeographyFilters = ReportFilters & {
  dateBasis: OrderDateBasis;
  country: string | null;
  region: string | null;
  channel: string | null;
};
export type GeographyData = { total: GeographyRow; groups: GeographyRow[]; trend: GeographyRow[] };
export async function getGeography(filters: GeographyFilters, baselines: BaselineRanges): Promise<GeographyData> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryGeography(filters, baselines) : sampleGeography(filters, baselines);
}
