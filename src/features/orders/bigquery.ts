import { SALES_CHANNEL_PREDICATE } from "@/lib/data/channel-sql";
/**
 * Orders, live. One bounded query per page: newest first by processed time
 * (store-local), then by order key, starting after the cursor. Filtering on
 * the partition column keeps each page's scan to the selected months.
 */
import "server-only";
import { ATTRIBUTION_RELATION, MAX_SIGNALS, toOrderAttribution, type OrderAttribution } from "./attribution";
import { orderDateEquals, orderDateExpression, orderDateWindow } from "@/lib/order-scope";
import { COUNTRY_SQL, REGION_SQL } from "@/lib/shipping-geography";
import type { ReportFilters } from "@/lib/filters";
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
  const at = orderDateExpression(filters.dateBasis);
  const params: QueryParameter[] = [
    { name: "store_id", type: "STRING", value: filters.storeId },
    { name: "start_date", type: "DATE", value: filters.range.from },
    { name: "end_date", type: "DATE", value: filters.range.to },
    { name: "limit", type: "INT64", value: PAGE_SIZE + 1 },
  ];
  const predicates = [orderDateWindow(filters.dateBasis, "@start_date", "@end_date")];
  if (filters.validOnly) predicates.push("is_order_sm_valid = TRUE");
  for (const [name, value, expression] of [
    ["country", filters.country, COUNTRY_SQL],
    ["region", filters.region, REGION_SQL],
  ] as const) {
    if (value) {
      params.push({ name, type: "STRING", value });
      predicates.push(`${expression} = @${name}`);
    }
  }
  if (filters.channel) {
    params.push({ name: "channel", type: "STRING", value: filters.channel });
    predicates.push(SALES_CHANNEL_PREDICATE);
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
      ${at} < @cursor_at
      OR (${at} = @cursor_at AND sm_order_key < @cursor_key))`);
  }

  const result = await warehouse.query({
    name: "orders_page",
    maxRows: PAGE_SIZE + 1,
    sql: `
      SELECT ${SUMMARY_COLUMNS}${filters.dateBasis ? `, ${at} AS scope_local` : ""}
      FROM ${warehouse.table(ORDERS_RELATION)}
      WHERE sm_store_id = @store_id
        AND ${predicates.join("\n        AND ")}
      ORDER BY ${at} DESC, sm_order_key DESC
      LIMIT @limit`,
    params,
  });
  const orders = decodeRows(OrderSummaryRow, result.rows, ORDERS_RELATION).map(toOrderSummary);
  const page = orders.slice(0, PAGE_SIZE);
  const last = page.at(-1);
  return {
    orders: page,
    nextCursor:
      orders.length > PAGE_SIZE && last
        ? {
            processedLocal: last.scopeLocal,
            key: last.key,
            ...(filters.dateBasis ? { dateBasis: filters.dateBasis } : {}),
          }
        : null,
  };
}

export async function queryOrderDetail(storeId: string, ref: OrderRef): Promise<OrderDetail | null> {
  const { warehouse } = await requireViewer({ live: true, storeId });
  const result = await warehouse.query({
    name: "order_detail",
    maxRows: 1,
    sql: `
      SELECT ${DETAIL_COLUMNS}${ref.dateBasis ? `, ${orderDateExpression(ref.dateBasis)} AS scope_local` : ""}
      FROM ${warehouse.table(ORDERS_RELATION)}
      WHERE sm_store_id = @store_id
        AND ${orderDateEquals(ref.dateBasis, "@processed_at")}
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
export async function queryOrderChannels(
  filters: ReportFilters & Pick<OrdersFilters, "dateBasis" | "validOnly" | "country" | "region">,
): Promise<string[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "order_channels",
    maxRows: 50,
    sql: `SELECT DISTINCT IFNULL(sm_channel, '(none)') AS channel
      FROM ${warehouse.table(ORDERS_RELATION)}
      WHERE sm_store_id = @store_id
        AND ${orderDateWindow(filters.dateBasis, "@start_date", "@end_date")}
        ${filters.validOnly ? "AND is_order_sm_valid = TRUE" : ""}
        ${filters.country ? `AND ${COUNTRY_SQL} = @country` : ""}
        ${filters.region ? `AND ${REGION_SQL} = @region` : ""}
      ORDER BY channel`,
    params: [
      { name: "country", type: "STRING", value: filters.country ?? "" },
      { name: "region", type: "STRING", value: filters.region ?? "" },
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
    ],
  });
  return decodeRows(OrderChannelRow, result.rows, ORDERS_RELATION).map((row) => row.channel);
}

/** On demand only. The membership EXISTS is scoped independently from the signals read. */
export async function queryOrderAttribution(storeId: string, orderKey: string): Promise<OrderAttribution> {
  const { warehouse } = await requireViewer({ live: true, storeId });
  const result = await warehouse.query({
    name: "order_attribution",
    maxRows: MAX_SIGNALS,
    partial: true,
    sql: `SELECT evidence_type, evidence_source, sm_marketing_channel, sm_utm_source, sm_utm_medium,
      sm_attribution_inference_method, sm_utm_final_source_priority,
      COUNTIF(sm_utm_final_source_priority = 1) OVER () AS winner_count,
      COUNT(*) OVER () AS signal_count
      FROM ${warehouse.table(ATTRIBUTION_RELATION)}
      WHERE sm_store_id = @store_id AND sm_order_key = @order_key
        AND EXISTS (SELECT 1 FROM ${warehouse.table(ORDERS_RELATION)}
          WHERE sm_store_id = @store_id AND sm_order_key = @order_key)
      ORDER BY sm_utm_final_source_priority ASC NULLS LAST, evidence_type, evidence_source, sm_utm_source, sm_utm_medium
      LIMIT ${MAX_SIGNALS + 1}`,
    params: [
      { name: "store_id", type: "STRING", value: storeId },
      { name: "order_key", type: "STRING", value: orderKey },
    ],
  });
  return toOrderAttribution(result.rows, result.truncated);
}
