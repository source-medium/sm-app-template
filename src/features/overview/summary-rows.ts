import { periodRange } from "@/lib/time-grain";
import type { OverviewData, OverviewFilters } from "./queries";

/** Shared by the table and download. SQL has already aggregated these measures. */
export function overviewSummaryRows(data: OverviewData, filters: OverviewFilters) {
  const rows = data.summaries.map(({ date, ...measures }) => ({
    ...measures,
    ...periodRange(date, filters.grain ?? "day", filters.range),
    rowType: "period" as "period" | "total",
  }));
  if (data.totals) rows.push({ ...data.totals, ...filters.range, rowType: "total" });
  return rows;
}
