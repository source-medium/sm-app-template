/**
 * Overview's data contract: daily store totals and period totals from
 * rpt_executive_summary_daily, for one store and an inclusive date range.
 * Live and sample implementations return exactly this shape. Money is in the
 * warehouse's reporting currency, as SourceMedium's models publish it.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { TimeGrain } from "@/lib/time-grain";
import { todayUtc, type DateRange, type ReportFilters } from "@/lib/filters";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { queryOverview, queryOverviewChannels } from "./bigquery";
import { sampleOverview, sampleOverviewSource } from "./sample";

export type OverviewMeasures = {
  /** NUMERIC, exact decimal text, in the reporting currency: SUM(order_net_revenue). */
  netRevenue: string | null;
  /** FLOAT64 in the warehouse: the model's order measure, which can be fractional. */
  orders: number | null;
  /** INT64, exact. */
  sessions: bigint | null;
  /** INT64, exact. */
  adClicks: bigint | null;
  /** NUMERIC, exact decimal text, in the reporting currency: SUM(ad_spend). */
  adSpend: string | null;
};

export type OverviewFilters = ReportFilters & { channel?: string | null; grain?: TimeGrain };

export type OverviewDay = OverviewMeasures & { date: string };

export type PurchaseMeasures = { netRevenue: string | null; orders: number | null };
export type PurchaseMix = { first: PurchaseMeasures; repeat: PurchaseMeasures };

export type OverviewData = {
  /** One entry per date that has rows; missing dates stay missing (gaps). */
  days: OverviewDay[];
  /** Period totals computed in the same query; null when the range is empty. */
  totals: OverviewMeasures | null;
  summaries: OverviewDay[];
  /** Published new/repeat order measures, not distinct customer counts. */
  purchases: PurchaseMix | null;
};

export async function getOverview(filters: OverviewFilters): Promise<OverviewData> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryOverview(filters) : sampleOverview(filters);
}

/** Options are scoped to the selected store and dates, before applying the channel filter. */
export async function getOverviewChannels(filters: ReportFilters): Promise<string[]> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live"
    ? queryOverviewChannels(filters)
    : [
        ...new Set(
          sampleOverviewSource(filters.storeId, filters.range, todayUtc(new Date())).map((row) => row.sm_channel),
        ),
      ].sort();
}

export type OverviewReport = {
  current: OverviewData;
  comparison: { data: OverviewData; error: null } | { data: null; error: WarehouseError } | null;
};

/** Two bounded, independently aggregated periods; Off makes only the current-period query. */
export async function getOverviewReport(filters: OverviewFilters, baseline: DateRange | null): Promise<OverviewReport> {
  await requireViewer({ storeId: filters.storeId });
  const comparison = baseline
    ? getOverview({ ...filters, range: baseline }).then(
        (data) => ({ data, error: null }),
        (error: unknown) => {
          if (!(error instanceof WarehouseError)) throw error;
          return { data: null, error };
        },
      )
    : null;
  const [current, compared] = await Promise.all([getOverview(filters), comparison]);
  return { current, comparison: compared };
}
