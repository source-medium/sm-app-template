import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { DateRange, ReportFilters } from "@/lib/filters";
import type { OrderDateBasis } from "@/lib/order-scope";
import { queryGeography } from "./bigquery";
import { sampleGeography } from "./sample";
import type { GeographyRow } from "./rows";

export type GeographyFilters = ReportFilters & {
  dateBasis: OrderDateBasis;
  country: string | null;
  region: string | null;
  channel: string | null;
};
export type GeographyData = { total: GeographyRow; groups: GeographyRow[]; trend: GeographyRow[] };
export async function getGeography(filters: GeographyFilters, baseline: DateRange | null): Promise<GeographyData> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryGeography(filters, baseline) : sampleGeography(filters, baseline);
}
