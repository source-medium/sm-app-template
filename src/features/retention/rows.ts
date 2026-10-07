import { z } from "zod";
import { bq, decodeRows } from "@/lib/data/decode";
import { toUnits } from "@/lib/data/decimal";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { COHORT_MONTHS } from "./filters";

export const RETENTION_RELATION = "rpt_cohort_ltv_by_first_valid_purchase_attribute_no_product_filters";
export const RetentionRow = z.object({
  channel: bq.string(),
  cohort_month: bq.date(),
  month_age: bq.int64().refine((value) => value >= 0n && value < BigInt(COHORT_MONTHS)),
  cohort_size: bq.numeric().nullable(),
  customers: bq.numeric().nullable(),
  cumulative_revenue: bq.numeric().nullable(),
  cumulative_profit: bq.numeric().nullable(),
});
export type RetentionRowData = z.output<typeof RetentionRow>;

/** Never silently merge duplicate cohort slices or divide different ages by different cohort sizes. */
export function decodeRetention(rows: Record<string, unknown>[]): RetentionRowData[] {
  const decoded = decodeRows(RetentionRow, rows, RETENTION_RELATION);
  const keys = new Set<string>();
  const sizes = new Map<string, bigint | null>();
  for (const row of decoded) {
    const cohortKey = JSON.stringify([row.channel, row.cohort_month]);
    const key = JSON.stringify([cohortKey, row.month_age.toString()]);
    if (keys.has(key))
      throw WarehouseError.incompatible(RETENTION_RELATION, "cohort_filter_name_filter_value_month_id");
    keys.add(key);
    const size = row.cohort_size === null ? null : toUnits(row.cohort_size);
    if (sizes.has(cohortKey) && sizes.get(cohortKey) !== size)
      throw WarehouseError.incompatible(RETENTION_RELATION, "cohort_size");
    sizes.set(cohortKey, size);
  }
  return decoded;
}
