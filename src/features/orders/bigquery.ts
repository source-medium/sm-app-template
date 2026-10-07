/**
 * Orders, live. One bounded query per page: newest first by processed time
 * (store-local), then by order key, starting after the cursor. Filtering on
 * the partition column keeps each page's scan to the selected months.
 */
import "server-only";
import type { ReportFilters } from "@/lib/filters";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { QueryParameter } from "@/lib/data/bigquery-rest.server";
import { decodeRows } from "@/lib/data/decode";
import { PAGE_SIZE, type OrderDetail, type OrderRef, type OrdersFilters, type OrdersPage } from "./queries";
import {
  DETAIL_COLUMNS,
  ORDERS_RELATION,
  OrderDetailRow,
  OrderChannelRow,
  OrderSummaryRow,
  SUMMARY_COLUMNS,
  toOrderDetail,
  toOrderSummary,
} from "./rows";

export async function queryOrders(filters: OrdersFilters): Promise<OrdersPage> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const params: QueryParameter[] = [
    { name: "store_id", type: "STRING", value: filters.storeId },
    { name: "start_date", type: "DATE", value: filters.range.from },
    { name: "end_date", type: "DATE", value: filters.range.to },
    { name: "limit", type: "INT64", value: PAGE_SIZE + 1 },
  ];
  const predicates = [
    "sm_store_id = @store_id",
    "order_processed_at_local_datetime >= DATETIME(@start_date)",
    "order_processed_at_local_datetime < DATETIME(DATE_ADD(@end_date, INTERVAL 1 DAY))",
  ];
  if (filters.channel) {
    params.push({ name: "channel", type: "STRING", value: filters.channel });
    predicates.push("IFNULL(sm_channel, '(none)') = @channel");
  }
  if (filters.search) {
    params.push({ name: "search", type: "STRING", value: filters.search });
    predicates.push(`(
      STARTS_WITH(LOWER(order_name), LOWER(@search))
      OR STARTS_WITH(LOWER(order_name), CONCAT('#', LOWER(@search)))
      OR order_number = @search
      OR order_id = @search)`);
  }
  if (filters.cursor) {
    params.push({ name: "cursor_at", type: "DATETIME", value: filters.cursor.processedLocal });
    params.push({ name: "cursor_key", type: "STRING", value: filters.cursor.key });
    predicates.push(`(
      order_processed_at_local_datetime < @cursor_at
      OR (order_processed_at_local_datetime = @cursor_at AND sm_order_key < @cursor_key))`);
  }

  const result = await warehouse.query({
    name: "orders_page",
    maxRows: PAGE_SIZE + 1,
    sql: `
      SELECT ${SUMMARY_COLUMNS}
      FROM ${warehouse.table(ORDERS_RELATION)}
      WHERE ${predicates.join("\n        AND ")}
      ORDER BY order_processed_at_local_datetime DESC, sm_order_key DESC
      LIMIT @limit`,
    params,
  });
  const orders = decodeRows(OrderSummaryRow, result.rows, ORDERS_RELATION).map(toOrderSummary);
  const page = orders.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    orders: page,
    nextCursor: orders.length > PAGE_SIZE && last ? { processedLocal: last.processedLocal, key: last.key } : null,
  };
}

export async function queryOrderDetail(storeId: string, ref: OrderRef): Promise<OrderDetail | null> {
  const { warehouse } = await requireViewer({ live: true, storeId });
  const result = await warehouse.query({
    name: "order_detail",
    maxRows: 1,
    sql: `
      SELECT ${DETAIL_COLUMNS}
      FROM ${warehouse.table(ORDERS_RELATION)}
      WHERE sm_store_id = @store_id
        AND order_processed_at_local_datetime = @processed_at
        AND sm_order_key = @order_key
      LIMIT 1`,
    params: [
      { name: "store_id", type: "STRING", value: storeId },
      { name: "processed_at", type: "DATETIME", value: ref.processedLocal },
      { name: "order_key", type: "STRING", value: ref.key },
    ],
  });
  const [row] = decodeRows(OrderDetailRow, result.rows, ORDERS_RELATION);
  return row ? toOrderDetail(row) : null;
}

/** Options span the date range before search and pagination; Orders intentionally includes invalid orders too. */
export async function queryOrderChannels(filters: ReportFilters): Promise<string[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "order_channels",
    maxRows: 50,
    sql: `SELECT DISTINCT IFNULL(sm_channel, '(none)') AS channel
      FROM ${warehouse.table(ORDERS_RELATION)}
      WHERE sm_store_id = @store_id
        AND order_processed_at_local_datetime >= DATETIME(@start_date)
        AND order_processed_at_local_datetime < DATETIME(DATE_ADD(@end_date, INTERVAL 1 DAY))
      ORDER BY channel`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
    ],
  });
  if (result.truncated) throw new WarehouseError("result_too_large", { reason: "order_channels" });
  return decodeRows(OrderChannelRow, result.rows, ORDERS_RELATION).map((row) => row.channel);
}
