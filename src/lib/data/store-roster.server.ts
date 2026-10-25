/**
 * Store identities, time zones and reporting currencies from SourceMedium's
 * registry dimension, dim_stores, which every delivery lane publishes. Any
 * failure to read it, including a missing table, surfaces.
 */
import "server-only";
import { z } from "zod";
import { bq, decodeRows } from "./decode";
import type { QueryRequest } from "./bigquery-rest.server";
import { CACHE_POLICY } from "./query-cache";
import type { Warehouse } from "./warehouse.server";
import { WarehouseError } from "./warehouse-error";

export const MAX_STORES = 50;
export const ROSTER_RELATION = "dim_stores";

const StoreRow = z.object({
  sm_store_id: bq.string().min(1),
  store_name: bq.string().nullable(),
  store_url: bq.string().nullable(),
  store_logo_url: bq.string().nullable(),
  brand_name: bq.string().nullable(),
  store_timezone: bq.string().nullable(),
  store_currency_code: bq.string().nullable(),
});
type StoreMetadata = z.infer<typeof StoreRow>;

export function storeRosterQuery(warehouse: Warehouse, storeId: string | null = null): QueryRequest {
  return {
    name: "store_roster",
    cache: CACHE_POLICY.roster,
    // More than MAX_STORES fails below, with a remedy for this case.
    partial: true,
    sql: `
      SELECT sm_store_id, store_name, store_url, store_logo_url, brand_name, store_timezone, store_currency_code
      FROM ${warehouse.table(ROSTER_RELATION)}
      WHERE sm_store_id IS NOT NULL
      ${storeId !== null ? "AND sm_store_id = @store_id" : ""}
      ORDER BY sm_store_id
      LIMIT @limit`,
    params: [
      ...(storeId !== null ? [{ name: "store_id", type: "STRING" as const, value: storeId }] : []),
      { name: "limit", type: "INT64", value: MAX_STORES + 1 },
    ],
    maxRows: MAX_STORES + 1,
  };
}

export async function queryStoreRoster(warehouse: Warehouse, storeId: string | null = null): Promise<StoreMetadata[]> {
  const result = await warehouse.query(storeRosterQuery(warehouse, storeId));
  const rows = decodeRows(StoreRow, result.rows, ROSTER_RELATION);
  if (rows.length > MAX_STORES || result.truncated) {
    throw new WarehouseError("result_too_large", {
      reason: "store_roster",
      remedy: `More than ${MAX_STORES} stores are available to this app. Give each audience its own deployment with APP_STORE_ID, or raise MAX_STORES in store-roster.server.ts deliberately.`,
    });
  }
  // A store listed twice is a delivery problem, not a changed column: no column, so no schema remedy.
  if (new Set(rows.map((row) => row.sm_store_id)).size !== rows.length)
    throw new WarehouseError("incompatible_schema", {
      relation: ROSTER_RELATION,
      reason: "duplicate_store_ids",
      remedy:
        "The store list (dim_stores) names a store more than once. Ask your SourceMedium admin to check its delivery.",
    });
  return rows;
}

const OffsetRow = z.object({ offset_minutes: bq.int64() });

/**
 * Without a zone from dim_stores, a store's time zone is the UTC offset
 * SourceMedium applied to its latest order's local time, as "-07:00". Amazon
 * order times use Los Angeles whatever the store's zone, so other sources come
 * first. Null without a recent order.
 */
export async function queryOrderTimeZone(warehouse: Warehouse, storeId: string): Promise<string | null> {
  const result = await warehouse.query({
    name: "store_order_offset",
    cache: CACHE_POLICY.storeTimeZone,
    maxRows: 1,
    sql: `
      SELECT TIMESTAMP_DIFF(TIMESTAMP(order_processed_at_local_datetime), order_processed_at, MINUTE) AS offset_minutes
      FROM ${warehouse.table("obt_orders")}
      WHERE sm_store_id = @store_id
        AND order_processed_at_local_datetime >= DATETIME_SUB(CURRENT_DATETIME(), INTERVAL 90 DAY)
        AND order_processed_at IS NOT NULL
      ORDER BY STARTS_WITH(LOWER(IFNULL(source_system, '')), 'amazon'), order_processed_at DESC
      LIMIT 1`,
    params: [{ name: "store_id", type: "STRING", value: storeId }],
  });
  const [row] = decodeRows(OffsetRow, result.rows, "obt_orders");
  if (!row) return null;
  const minutes = Number(row.offset_minutes);
  if (Math.abs(minutes) > 14 * 60) throw WarehouseError.incompatible("obt_orders", "order_processed_at_local_datetime");
  const absolute = Math.abs(minutes);
  return `${minutes < 0 ? "-" : "+"}${String(Math.floor(absolute / 60)).padStart(2, "0")}:${String(absolute % 60).padStart(2, "0")}`;
}
