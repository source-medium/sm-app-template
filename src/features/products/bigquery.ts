import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import { WarehouseError } from "@/lib/data/warehouse-error";
import type { DateRange } from "@/lib/filters";
import type { ProductFilters, ProductsData } from "./queries";
import { MAX_PRODUCTS, PRODUCTS_RELATION, ProductRow } from "./rows";

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
} as const;
const SORTS = { revenue: "revenue", units: "units", profit: "profit" } as const;

export async function queryProducts(filters: ProductFilters, baseline: DateRange | null): Promise<ProductsData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const dimension = DIMENSIONS[filters.dimension];
  const sort = SORTS[filters.metric];
  const measures = Object.entries(MEASURES);
  const result = await warehouse.query({
    name: "products_ranked",
    maxRows: MAX_PRODUCTS + 1,
    sql: `WITH grouped AS (
      SELECT ${dimension.key} AS product_key,
        ARRAY_AGG(${dimension.label} ORDER BY order_processed_at_local_datetime DESC, sm_order_line_key DESC LIMIT 1)[OFFSET(0)] AS label,
        MAX(${dimension.reference}) AS reference,
        ${measures
          .flatMap(([name, column]) => [
            `SUM(IF(DATE(order_processed_at_local_datetime) BETWEEN @start_date AND @end_date, ${column}, NULL)) AS ${name}`,
            `SUM(IF(@compare AND DATE(order_processed_at_local_datetime) BETWEEN @baseline_from AND @baseline_to, ${column}, NULL)) AS previous_${name}`,
          ])
          .join(",\n")}
      FROM ${warehouse.table(PRODUCTS_RELATION)}
      WHERE sm_store_id = @store_id AND is_order_sm_valid = TRUE
        AND ((order_processed_at_local_datetime >= DATETIME(@start_date)
          AND order_processed_at_local_datetime < DATETIME(DATE_ADD(@end_date, INTERVAL 1 DAY)))
          OR (@compare AND order_processed_at_local_datetime >= DATETIME(@baseline_from)
          AND order_processed_at_local_datetime < DATETIME(DATE_ADD(@baseline_to, INTERVAL 1 DAY))))
      GROUP BY product_key
    )
    SELECT *,
      ${measures.flatMap(([name]) => [`SUM(${name}) OVER () AS total_${name}`, `SUM(previous_${name}) OVER () AS total_previous_${name}`]).join(",\n")},
      MIN(${sort}) OVER () AS minimum_value
    FROM grouped ORDER BY ${sort} DESC NULLS LAST, product_key LIMIT ${MAX_PRODUCTS + 1}`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
      { name: "compare", type: "BOOL", value: baseline !== null },
      { name: "baseline_from", type: "DATE", value: baseline?.from ?? filters.range.from },
      { name: "baseline_to", type: "DATE", value: baseline?.to ?? filters.range.to },
    ],
  });
  if (result.truncated) throw new WarehouseError("result_too_large", { reason: "products_ranked" });
  const rows = decodeRows(ProductRow, result.rows, PRODUCTS_RELATION);
  return { rows: rows.slice(0, MAX_PRODUCTS), hasMore: rows.length > MAX_PRODUCTS };
}
