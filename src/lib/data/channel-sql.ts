import { AD_PLATFORM_ALIASES } from "@/lib/ad-platforms";
import { VALID_SALES_CHANNELS } from "@/lib/sales-channels";
import { isSummaryOrderMeasure, type SummaryMeasure } from "@/lib/summary-measures";
/** Values are normalized by parseSalesChannel: one channel or a JSON string array, never JSON nulls. */
export const SALES_CHANNEL_PREDICATE = `((@channel = '' OR IFNULL(sm_channel, '(none)') = @channel) AND NOT STARTS_WITH(@channel, '[')
  OR IFNULL(sm_channel, '(none)') IN UNNEST(IFNULL(JSON_VALUE_ARRAY(@channel), ARRAY<STRING>[])))`;

/**
 * The ad platform of an rpt_ad_performance_daily or rpt_ad_creative_assets row, labeled by `adPlatformLabel`
 * (src/lib/ad-platforms.ts): its source_system, with an alias read as its platform's key (AD_PLATFORM_ALIASES).
 * The keys are code constants, never browser input. rpt_ad_performance_daily's sm_channel is the sales
 * channel, never the platform.
 */
export const AD_PLATFORM_SQL = `CASE source_system${[...AD_PLATFORM_ALIASES]
  .map(([alias, key]) => ` WHEN '${alias}' THEN '${key}'`)
  .join("")} ELSE COALESCE(source_system, '(unknown platform)') END`;

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
