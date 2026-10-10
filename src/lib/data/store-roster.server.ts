/**
 * Store identities and time zones from SourceMedium's registry dimension.
 * Warehouses that have not received it yet retain the summary's ID-only
 * roster. Only a missing relation permits that fallback; permission, schema
 * and query failures surface.
 */
import "server-only";
import { z } from "zod";
import { bq, decodeRows } from "./decode";
import type { QueryRequest } from "./bigquery-rest.server";
import type { Warehouse } from "./warehouse.server";
import { WarehouseError } from "./warehouse-error";

export const MAX_STORES = 50;
export const ROSTER_RELATION = "dim_stores";
export const LEGACY_ROSTER_RELATION = "rpt_executive_summary_daily";
type RosterRelation = typeof ROSTER_RELATION | typeof LEGACY_ROSTER_RELATION;

const StoreRow = z.object({
  sm_store_id: bq.string().min(1),
  store_name: bq.string().nullable(),
  brand_name: bq.string().nullable(),
  store_timezone: bq.string().nullable(),
});
type StoreMetadata = z.infer<typeof StoreRow>;
export type StoreRoster = { stores: StoreMetadata[]; relation: RosterRelation };

export function storeRosterQuery(
  warehouse: Warehouse,
  storeId: string | null = null,
  relation: RosterRelation = ROSTER_RELATION,
): QueryRequest {
  return {
    name: "store_roster",
    sql: `
      SELECT ${relation === ROSTER_RELATION ? "sm_store_id, store_name, brand_name, store_timezone" : "DISTINCT sm_store_id, CAST(NULL AS STRING) AS store_name, CAST(NULL AS STRING) AS brand_name, CAST(NULL AS STRING) AS store_timezone"}
      FROM ${warehouse.table(relation)}
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

export async function queryStoreRoster(warehouse: Warehouse, storeId: string | null = null): Promise<StoreRoster> {
  let relation: RosterRelation = ROSTER_RELATION;
  let result;
  try {
    result = await warehouse.query(storeRosterQuery(warehouse, storeId), { missingRelationOk: true });
  } catch (error) {
    if (!(error instanceof WarehouseError) || error.kind !== "not_found" || error.job) throw error;
    relation = LEGACY_ROSTER_RELATION;
    result = await warehouse.query(storeRosterQuery(warehouse, storeId, relation));
  }
  const rows = decodeRows(StoreRow, result.rows, relation);
  if (rows.length > MAX_STORES || result.truncated) {
    throw new WarehouseError("result_too_large", {
      reason: "store_roster",
      remedy: `More than ${MAX_STORES} stores are available to this app. Give each audience its own deployment with APP_STORE_ID, or raise MAX_STORES in store-roster.server.ts deliberately.`,
    });
  }
  if (new Set(rows.map((row) => row.sm_store_id)).size !== rows.length)
    throw WarehouseError.incompatible(relation, "sm_store_id");
  return { stores: rows, relation };
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
