import { SALES_CHANNEL_PREDICATE } from "@/lib/data/channel-sql";
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import type { ReportFilters } from "@/lib/filters";
import { dateTimeWindow, PERIOD_COVERAGE, periodParams, periodSql } from "@/lib/data/period-sql";
import type { ProductFilters, ProductsData } from "./queries";
import {
  MAX_PRODUCTS,
  PRODUCTS_RELATION,
  ProductChannelRow,
  ProductRow,
  ProductCoverageRow,
  type ProductMeasure,
} from "./rows";
import { CACHE_POLICY } from "@/lib/data/query-cache";
import type { BaselineRanges } from "@/lib/comparison";

// Titles and SKUs can collide. Keys include source identity; unassigned lines remain a named group.
const DIMENSIONS = {
  product: {
    key: "TO_JSON_STRING(STRUCT(source_system, product_id))",
    label: "COALESCE(product_title, 'Unassigned product')",
    reference: "CONCAT(COALESCE(source_system, 'unknown source'), ' / ', COALESCE(product_id, 'unassigned'))",
  },
  variant: {
    key: "TO_JSON_STRING(STRUCT(source_system, product_id, product_variant_id, sm_product_variant_key))",
    label:
      "CONCAT(COALESCE(product_title, 'Unassigned product'), ' / ', COALESCE(product_variant_title, sku, 'Unassigned variant'))",
    reference:
      "CONCAT(COALESCE(source_system, 'unknown source'), ' / ', COALESCE(sm_product_variant_key, product_variant_id, 'unassigned'))",
  },
} as const;
const MEASURES = {
  revenue: "order_line_net_revenue",
  units: "order_line_net_quantity",
  profit: "order_line_product_gross_profit",
  refunds: "-order_line_refunds",
  refunded_units: "-order_line_refund_quantity",
} as const satisfies Record<ProductMeasure, string>;
const SORTS = {
  revenue: "revenue",
  units: "units",
  profit: "profit",
  refunds: "refunds",
  refunded_units: "refunded_units",
} as const;

/** Count costs on real lines only; retain order-summary adjustments in unit totals. */
export async function queryProductCoverage(
  filters: ReportFilters & Partial<Pick<ProductFilters, "channel" | "entity" | "dimension">>,
) {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "product_cost_coverage",
    cache: CACHE_POLICY.aggregate,
    maxRows: 1,
    sql: `SELECT COUNTIF(order_line_id IS NOT NULL) AS lines,
      COUNTIF(order_line_id IS NOT NULL AND order_line_product_cost IS NULL) AS missing_cost_lines,
      COUNTIF(order_line_id IS NOT NULL AND order_line_product_cost = 0) AS zero_cost_lines,
      SUM(order_line_quantity) AS ordered_units,
      -SUM(order_line_refund_quantity) AS refunded_units
      FROM ${warehouse.table(PRODUCTS_RELATION)}
      WHERE sm_store_id = @store_id AND is_order_sm_valid = TRUE
        AND ${SALES_CHANNEL_PREDICATE}
        ${filters.entity ? `AND ${DIMENSIONS[filters.dimension ?? "product"].key} = @entity` : ""}
        AND ${dateTimeWindow("order_processed_at_local_datetime", "@start_date", "@end_date")}`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      ...(filters.entity ? [{ name: "entity", type: "STRING" as const, value: filters.entity }] : []),
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
    ],
  });
  const row = decodeRows(ProductCoverageRow, result.rows, PRODUCTS_RELATION)[0];
  if (!row) throw new Error("Product coverage aggregate returned no row");
  return row;
}

export async function queryProducts(filters: ProductFilters, baselines: BaselineRanges): Promise<ProductsData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const dimension = DIMENSIONS[filters.dimension];
  const sort = SORTS[filters.metric];
  const measures = Object.entries(MEASURES);
  const period = periodSql("DATE(order_processed_at_local_datetime)");
  const result = await warehouse.query({
    name: "products_ranked",
    cache: CACHE_POLICY.aggregate,
    maxRows: MAX_PRODUCTS + 1,
    sql: `WITH grouped AS (
      SELECT ${dimension.key} AS product_key,
        -- Equal timestamps choose a stable label directly, avoiding a scan of every order-line key just to break ties.
        ARRAY_AGG(${dimension.label} ORDER BY order_processed_at_local_datetime DESC, ${dimension.label} DESC LIMIT 1)[OFFSET(0)] AS label,
        MAX(${dimension.reference}) AS reference,
        ${measures.map(([name, column]) => period.sum(column, name)).join(",\n")},
        ${period.latest}
      FROM ${warehouse.table(PRODUCTS_RELATION)}
      WHERE sm_store_id = @store_id AND is_order_sm_valid = TRUE
        AND ${SALES_CHANNEL_PREDICATE}
        AND ${period.dateTimeRows("order_processed_at_local_datetime")}
      GROUP BY product_key
    )
    SELECT ${PERIOD_COVERAGE},
      ${measures.flatMap(([name]) => [`SUM(${name}) OVER () AS total_${name}`, `SUM(previous_${name}) OVER () AS total_previous_${name}`, `SUM(second_${name}) OVER () AS total_second_${name}`]).join(",\n")},
      MIN(${sort}) OVER () AS minimum_value
    FROM grouped ${filters.entity ? "WHERE product_key = @entity" : ""}
    -- Period gainers and decliners rank against the first comparison period.
    ORDER BY ${filters.ranking === "gainers" ? `${sort} - previous_${sort} DESC` : filters.ranking === "decliners" ? `${sort} - previous_${sort} ASC` : `${sort} DESC`} NULLS LAST, product_key LIMIT ${MAX_PRODUCTS + 1}`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      ...(filters.entity ? [{ name: "entity", type: "STRING" as const, value: filters.entity }] : []),
      ...periodParams(filters.range, baselines[0], baselines[1]),
    ],
  });
  // Products with no value in the selected period sort last; they have nothing to rank, so they never pad the list.
  const rows = decodeRows(ProductRow, result.rows, PRODUCTS_RELATION).filter((row) => row[filters.metric] !== null);
  return { rows: rows.slice(0, MAX_PRODUCTS), hasMore: rows.length > MAX_PRODUCTS };
}

/** Roster before ranking or channel selection, so top products never hide a channel. */
export async function queryProductChannels(filters: ReportFilters): Promise<string[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "product_channels",
    cache: CACHE_POLICY.aggregate,
    maxRows: 50,
    sql: `SELECT DISTINCT IFNULL(sm_channel, '(none)') AS channel
      FROM ${warehouse.table(PRODUCTS_RELATION)}
      WHERE sm_store_id = @store_id AND is_order_sm_valid = TRUE
        AND ${dateTimeWindow("order_processed_at_local_datetime", "@start_date", "@end_date")}
      ORDER BY channel`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
    ],
  });
  return decodeRows(ProductChannelRow, result.rows, PRODUCTS_RELATION).map((row) => row.channel);
}
