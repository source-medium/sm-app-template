import { VALID_SALES_CHANNELS } from "@/lib/sales-channels";
/** Values are normalized by parseSalesChannel: one legacy value or a JSON string array, never JSON nulls. */
export const SALES_CHANNEL_PREDICATE = `((@channel = '' OR IFNULL(sm_channel, '(none)') = @channel) AND NOT STARTS_WITH(@channel, '[')
  OR IFNULL(sm_channel, '(none)') IN UNNEST(IFNULL(JSON_VALUE_ARRAY(@channel), ARRAY<STRING>[])))`;

/** The catalog's filter on summary order count and net revenue (dashboard-metrics-v1), verbatim. */
export const VALID_SALES_CHANNEL_SQL = `sm_channel in (${VALID_SALES_CHANNELS.map((channel) => `'${channel}'`).join(", ")})`;

/**
 * An order measure as the catalog counts it: rows outside the valid sales channels add nothing.
 * Ad spend, sessions and clicks are not order validity and stay unwrapped. Zero, not NULL, so a
 * valid row's own NULL still sums as before and a non-valid selection reads as no sales.
 */
export function validSales(column: string): string {
  return `IF(${VALID_SALES_CHANNEL_SQL}, ${column}, 0)`;
}
