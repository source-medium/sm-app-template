import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { RetentionFilters, RetentionSegmentFilters, RetentionSegments } from "./queries";
import { COHORT_MONTHS, shiftMonth } from "./filters";
import { decodeRetention, RetentionSegmentRow, RETENTION_RELATION, type RetentionRowData } from "./rows";
import { decodeRows } from "@/lib/data/decode";
import { CACHE_POLICY } from "@/lib/data/query-cache";

export async function queryRetention(filters: RetentionFilters): Promise<RetentionRowData[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const dimension = filters.dimension ?? "no_filters";
  const segment = filters.segment ?? "";
  const segmented = dimension !== "no_filters";
  if (segmented && !filters.segment) return [];
  const result = await warehouse.query({
    name: "retention_cohorts",
    cache: CACHE_POLICY.aggregate,
    maxRows: 2000,
    // Exactly one dimension/value slice per channel/cohort/age. Segment families overlap and must never be pooled.
    // The relation publishes counts and money as FLOAT64; NUMERIC casts keep the decoders and sums exact from here.
    // A row with no channel is its own '(none)' group, as in the other views, not a decoding error.
    sql: `SELECT IFNULL(sm_channel, '(none)') AS channel, cohort_month, months_since_first_order AS month_age,
        CAST(cohort_size AS NUMERIC) AS cohort_size,
        CAST(customer_count AS NUMERIC) AS customers,
        CAST(cumulative_second_order_count AS NUMERIC) AS second_orders,
        CAST(cumulative_order_net_revenue AS NUMERIC) AS cumulative_revenue,
        CAST(cumulative_order_gross_profit AS NUMERIC) AS cumulative_profit
      FROM ${warehouse.table(RETENTION_RELATION)}
      WHERE sm_store_id = @store_id
        AND ${segmented ? "acquisition_order_filter_dimension = @dimension AND acquisition_order_filter_dimension_value = @segment" : "acquisition_order_filter_dimension = 'no_filters'"}
        AND sm_order_line_type = 'all_orders'
        AND cohort_month BETWEEN @cohort_from AND @as_of_month
        AND months_since_first_order BETWEEN 0 AND ${COHORT_MONTHS - 1}
        AND DATE_ADD(cohort_month, INTERVAL months_since_first_order MONTH) <= @as_of_month
      ORDER BY channel, cohort_month, months_since_first_order`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "cohort_from", type: "DATE", value: `${shiftMonth(filters.asOf, 1 - COHORT_MONTHS)}-01` },
      { name: "as_of_month", type: "DATE", value: `${filters.asOf}-01` },
      ...(segmented
        ? [
            { name: "dimension", type: "STRING" as const, value: dimension },
            { name: "segment", type: "STRING" as const, value: segment },
          ]
        : []),
    ],
  });
  return decodeRetention(result.rows);
}

/** Only age-zero rows are needed for options. Search and selected channel keep high-cardinality lists bounded. */
export async function queryRetentionSegments(filters: RetentionSegmentFilters): Promise<RetentionSegments> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  if (!filters.dimension || filters.dimension === "no_filters") return { values: [], truncated: false };
  const result = await warehouse.query({
    name: "retention_segments",
    cache: CACHE_POLICY.aggregate,
    maxRows: 200,
    partial: true,
    sql: `SELECT DISTINCT acquisition_order_filter_dimension_value AS segment
      FROM ${warehouse.table(RETENTION_RELATION)}
      WHERE sm_store_id = @store_id
        AND acquisition_order_filter_dimension = @dimension
        AND sm_order_line_type = 'all_orders'
        AND IFNULL(sm_channel, '(none)') = @channel
        AND cohort_month BETWEEN @cohort_from AND @as_of_month
        AND months_since_first_order = 0
        AND acquisition_order_filter_dimension_value IS NOT NULL
        AND STRPOS(LOWER(acquisition_order_filter_dimension_value), LOWER(@search)) > 0
      ORDER BY segment
      LIMIT 201`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "cohort_from", type: "DATE", value: `${shiftMonth(filters.asOf, 1 - COHORT_MONTHS)}-01` },
      { name: "as_of_month", type: "DATE", value: `${filters.asOf}-01` },
      { name: "dimension", type: "STRING", value: filters.dimension },
      { name: "channel", type: "STRING", value: filters.channel },
      { name: "search", type: "STRING", value: filters.search },
    ],
  });
  return {
    values: decodeRows(RetentionSegmentRow, result.rows, RETENTION_RELATION).map((row) => row.segment),
    truncated: result.truncated,
  };
}
