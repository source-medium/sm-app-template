/**
 * Overview's data contract: daily store totals and period totals from
 * rpt_executive_summary_daily, for one store and an inclusive date range.
 * Live and sample implementations return exactly this shape. Money is in the
 * warehouse's reporting currency, as SourceMedium's models publish it.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { TimeGrain } from "@/lib/time-grain";
import type { DateRange, ReportFilters } from "@/lib/filters";
import type { PeriodCoverage, BaselineRanges } from "@/lib/comparison";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { queryOverview, queryOverviewChannels } from "./bigquery";
import { sampleOverview } from "./sample";
import { sampleSummaryChannels } from "@/lib/sample/executive-summary";

export type OverviewMeasures = {
  /** NUMERIC, exact decimal text, in the reporting currency: SUM(order_net_revenue). */
  netRevenue: string | null;
  /** FLOAT64 in the warehouse: the model's order measure, which can be fractional. */
  orders: number | null;
  /** INT64, exact. */
  sessions: bigint | null;
  /** NUMERIC, exact decimal text, in the reporting currency: SUM(ad_spend). */
  adSpend: string | null;
};

export type OverviewFilters = ReportFilters & { channel?: string | null; grain?: TimeGrain };

export type OverviewDay = OverviewMeasures & { date: string };

export type PurchaseMeasures = { netRevenue: string | null; orders: number | null };
export type PurchaseMix = { first: PurchaseMeasures; repeat: PurchaseMeasures };

export type RevenueDeductions = {
  gross: string | null;
  discounts: string | null;
  refunds: string | null;
  net: string | null;
};

export type RevenueContribution = {
  channel: string | null;
  sub_channel: string | null;
  revenue: string | null;
  remainder: boolean;
};

export type OverviewData = {
  /** Optional supporting breakdown; never used to compute the report totals. */
  contributions?: RevenueContribution[] | null;
  revenue: RevenueDeductions | null;
  /** One entry per date that has rows; missing dates stay missing (gaps). */
  days: OverviewDay[];
  /** Period totals computed in the same query; null when the range is empty. */
  totals: OverviewMeasures | null;
  summaries: OverviewDay[];
  /** Published new/repeat order measures, not distinct customer counts. */
  purchases: PurchaseMix | null;
  /** Latest date with rows in this query, from MAX(date). Null when the range is empty. */
  latestDate: string | null;
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
    : sampleSummaryChannels(filters.storeId, filters.range);
}

export type OverviewBaseline = { data: OverviewData; error: null } | { data: null; error: WarehouseError };

export type OverviewReport = {
  current: OverviewData;
  /** One entry per comparison slot: its data, or why it failed; null when the slot has no dates. */
  baselines: [OverviewBaseline | null, OverviewBaseline | null];
  /** Each period's latest date with rows, for slotChanges(). */
  coverage: PeriodCoverage;
};

/**
 * One slot's view of the report, in the shape the headline, highlights and
 * chart overlay read: the current period against that one baseline. `coverage`
 * is null when the slot has no data, so periodChanges() hides its changes.
 */
export type OverviewSlice = {
  current: OverviewData;
  comparison: OverviewBaseline | null;
  coverage: PeriodCoverage | null;
};

export function overviewSlice(report: OverviewReport, slot: 0 | 1): OverviewSlice {
  const comparison = report.baselines[slot];
  const latest = slot === 0 ? report.coverage.previous_latest_date : (report.coverage.second_latest_date ?? null);
  return {
    current: report.current,
    comparison,
    coverage: comparison?.data ? { latest_date: report.coverage.latest_date, previous_latest_date: latest } : null,
  };
}

/** Up to three bounded, independently aggregated periods, read side by side; Off makes only the current-period query. */
export async function getOverviewReport(filters: OverviewFilters, baselines: BaselineRanges): Promise<OverviewReport> {
  await requireViewer({ storeId: filters.storeId });
  const load = (range: DateRange | null): Promise<OverviewBaseline> | null =>
    range
      ? getOverview({ ...filters, range }).then(
          (data): OverviewBaseline => ({ data, error: null }),
          (error: unknown): OverviewBaseline => {
            if (!(error instanceof WarehouseError)) throw error;
            return { data: null, error };
          },
        )
      : null;
  const [current, first, second] = await Promise.all([getOverview(filters), load(baselines[0]), load(baselines[1])]);
  return {
    current,
    baselines: [first, second],
    coverage: {
      latest_date: current.latestDate,
      previous_latest_date: first?.data?.latestDate ?? null,
      second_latest_date: second?.data?.latestDate ?? null,
    },
  };
}
