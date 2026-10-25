import { VALID_SALES_CHANNELS } from "@/lib/sales-channels";
import { isSummaryOrderMeasure, type SummaryMeasure } from "@/lib/summary-measures";
/** Values are normalized by parseSalesChannel: one channel or a JSON string array, never JSON nulls. */
export const SALES_CHANNEL_PREDICATE = `((@channel = '' OR IFNULL(sm_channel, '(none)') = @channel) AND NOT STARTS_WITH(@channel, '[')
  OR IFNULL(sm_channel, '(none)') IN UNNEST(IFNULL(JSON_VALUE_ARRAY(@channel), ARRAY<STRING>[])))`;

/**
 * The ad platform of an rpt_ad_performance_daily row, labeled by `adPlatformLabel` (src/lib/ad-platforms.ts).
 * That relation's sm_channel is the sales channel, never the platform.
 */
export const AD_PLATFORM_SQL = "COALESCE(source_system, '(unknown platform)')";

/** The catalog's filter on summary order count and net revenue (dashboard-metrics-v1), verbatim. */
export const VALID_SALES_CHANNEL_SQL = `sm_channel in (${VALID_SALES_CHANNELS.map((channel) => `'${channel}'`).join(", ")})`;

/**
 * A summary measure as the catalog counts it: order measures outside the valid sales channels add nothing.
 * Ad spend, sessions and clicks are not order validity and stay unwrapped. Zero, not NULL, so a
 * valid row's own NULL still sums as before and a non-valid selection reads as no sales.
 */
export function summaryMeasure(column: SummaryMeasure): string {
  return isSummaryOrderMeasure(column) ? `IF(${VALID_SALES_CHANNEL_SQL}, ${column}, 0)` : column;
}
