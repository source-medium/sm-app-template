/**
 * Overview's data contract: daily store totals and period totals from
 * rpt_executive_summary_daily, for one store and an inclusive date range.
 * Live and sample implementations return exactly this shape.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import { queryOverview } from "./bigquery";
import { sampleOverview } from "./sample";

export type OverviewMeasures = {
  /** FLOAT64 in the warehouse: the model's order measure, which can be fractional. */
  orders: number | null;
  /** INT64, exact. */
  sessions: bigint | null;
  /** INT64, exact. */
  adClicks: bigint | null;
};

export type OverviewDay = OverviewMeasures & { date: string };

export type OverviewData = {
  /** One entry per date that has rows; missing dates stay missing (gaps). */
  days: OverviewDay[];
  /** Period totals computed in the same query; null when the range is empty. */
  totals: OverviewMeasures | null;
};

export async function getOverview(filters: ReportFilters): Promise<OverviewData> {
  const access = await requireViewer();
  return access.mode === "live" ? queryOverview(filters) : sampleOverview(filters);
}
