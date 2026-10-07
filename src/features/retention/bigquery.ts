import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { WarehouseError } from "@/lib/data/warehouse-error";
import type { RetentionFilters } from "./queries";
import { COHORT_MONTHS, shiftMonth } from "./filters";
import { decodeRetention, RETENTION_RELATION, type RetentionRowData } from "./rows";

export async function queryRetention(filters: RetentionFilters): Promise<RetentionRowData[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "retention_cohorts",
    maxRows: 2000,
    // The unsegmented slice is already one row per channel/cohort/age. Other dimensions overlap.
    // Demo masking publishes FLOAT64 counts/money; NUMERIC casts also preserve the canonical INT64/NUMERIC schema.
    sql: `SELECT sm_channel AS channel, cohort_month, months_since_first_order AS month_age,
        CAST(cohort_size AS NUMERIC) AS cohort_size,
        CAST(customer_count AS NUMERIC) AS customers,
        CAST(cumulative_order_net_revenue AS NUMERIC) AS cumulative_revenue,
        CAST(cumulative_order_gross_profit AS NUMERIC) AS cumulative_profit
      FROM ${warehouse.table(RETENTION_RELATION)}
      WHERE sm_store_id = @store_id
        AND acquisition_order_filter_dimension = 'no_filters'
        AND sm_order_line_type = 'all_orders'
        AND cohort_month BETWEEN @cohort_from AND @as_of_month
        AND months_since_first_order BETWEEN 0 AND ${COHORT_MONTHS - 1}
        AND DATE_ADD(cohort_month, INTERVAL months_since_first_order MONTH) <= @as_of_month
      ORDER BY sm_channel, cohort_month, months_since_first_order`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "cohort_from", type: "DATE", value: `${shiftMonth(filters.asOf, 1 - COHORT_MONTHS)}-01` },
      { name: "as_of_month", type: "DATE", value: `${filters.asOf}-01` },
    ],
  });
  if (result.truncated) throw new WarehouseError("result_too_large", { reason: "retention_cohorts" });
  return decodeRetention(result.rows);
}
