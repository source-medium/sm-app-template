/**
 * Orders, live. One bounded query per page: newest first by creation time,
 * then by order key, starting after the cursor. The coarse timestamp bound
 * lets BigQuery prune partitions; the local-date predicate is the filter.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import type { QueryParameter } from "@/lib/data/bigquery-rest.server";
import { PAGE_SIZE, type OrderCursor, type OrderDetail, type OrdersFilters, type OrdersPage } from "./queries";
import {
  DETAIL_COLUMNS,
  ORDERS_RELATION,
  OrderDetailRow,
  OrderSummaryRow,
  SUMMARY_COLUMNS,
  toOrderDetail,
  toOrderSummary,
} from "./rows";

export async function queryOrders(filters: OrdersFilters): Promise<OrdersPage> {
  const { warehouse } = await requireViewer({ live: true });
  const params: QueryParameter[] = [
    { name: "store_id", type: "STRING", value: filters.storeId },
    { name: "start_date", type: "DATE", value: filters.range.from },
    { name: "end_date", type: "DATE", value: filters.range.to },
    { name: "limit", type: "INT64", value: PAGE_SIZE + 1 },
  ];
  const predicates = [
    "sm_store_id = @store_id",
    "order_created_at >= TIMESTAMP_SUB(TIMESTAMP(@start_date), INTERVAL 1 DAY)",
    "order_created_at < TIMESTAMP_ADD(TIMESTAMP(@end_date), INTERVAL 2 DAY)",
    "COALESCE(DATE(order_created_at_local_datetime), DATE(order_created_at)) BETWEEN @start_date AND @end_date",
  ];
  if (filters.search) {
    params.push({ name: "search", type: "STRING", value: filters.search });
    predicates.push(`(
      STARTS_WITH(LOWER(order_name), LOWER(@search))
      OR STARTS_WITH(LOWER(order_name), CONCAT('#', LOWER(@search)))
      OR order_number = @search
      OR order_id = @search)`);
  }
  if (filters.cursor) {
    params.push({ name: "cursor_micros", type: "INT64", value: filters.cursor.createdAtMicros });
    params.push({ name: "cursor_key", type: "STRING", value: filters.cursor.key });
    predicates.push(`(
      UNIX_MICROS(order_created_at) < @cursor_micros
      OR (UNIX_MICROS(order_created_at) = @cursor_micros AND sm_order_key < @cursor_key))`);
  }

  const result = await warehouse.query({
    name: "orders_page",
    maxRows: PAGE_SIZE + 1,
    sql: `
      SELECT ${SUMMARY_COLUMNS}
      FROM ${warehouse.table(ORDERS_RELATION)}
      WHERE ${predicates.join("\n        AND ")}
      ORDER BY order_created_at DESC, sm_order_key DESC
      LIMIT @limit`,
    params,
  });
  const orders = decodeRows(OrderSummaryRow, result.rows, ORDERS_RELATION).map(toOrderSummary);
  const page = orders.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    orders: page,
    nextCursor: orders.length > PAGE_SIZE && last ? { createdAtMicros: last.createdAt.micros, key: last.key } : null,
  };
}

export async function queryOrderDetail(storeId: string, ref: OrderCursor): Promise<OrderDetail | null> {
  const { warehouse } = await requireViewer({ live: true });
  const result = await warehouse.query({
    name: "order_detail",
    maxRows: 1,
    sql: `
      SELECT ${DETAIL_COLUMNS}
      FROM ${warehouse.table(ORDERS_RELATION)}
      WHERE sm_store_id = @store_id
        AND order_created_at = TIMESTAMP_MICROS(@created_micros)
        AND sm_order_key = @order_key
      LIMIT 1`,
    params: [
      { name: "store_id", type: "STRING", value: storeId },
      { name: "created_micros", type: "INT64", value: ref.createdAtMicros },
      { name: "order_key", type: "STRING", value: ref.key },
    ],
  });
  const [row] = decodeRows(OrderDetailRow, result.rows, ORDERS_RELATION);
  return row ? toOrderDetail(row) : null;
}
