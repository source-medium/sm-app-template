/**
 * The store roster query: a bounded, distinct list of sm_store_id values
 * from the executive summary. Overflow past the bound is an error, never a
 * silently shorter list. The doctor runs it as the example query.
 */
import "server-only";
import { z } from "zod";
import { bq, decodeRows } from "./decode";
import type { QueryRequest } from "./bigquery-rest.server";
import type { Warehouse } from "./warehouse.server";
import { WarehouseError } from "./warehouse-error";

export const MAX_STORES = 50;
export const ROSTER_RELATION = "rpt_executive_summary_daily";

const StoreRow = z.object({ sm_store_id: bq.string() });

export function storeRosterQuery(warehouse: Warehouse, storeId: string | null = null): QueryRequest {
  return {
    name: "store_roster",
    sql: `
      SELECT DISTINCT sm_store_id
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

export async function queryStoreRoster(warehouse: Warehouse, storeId: string | null = null): Promise<string[]> {
  const result = await warehouse.query(storeRosterQuery(warehouse, storeId));
  const rows = decodeRows(StoreRow, result.rows, ROSTER_RELATION);
  if (rows.length > MAX_STORES || result.truncated) {
    throw new WarehouseError("result_too_large", { reason: "store_roster" });
  }
  return rows.map((row) => row.sm_store_id);
}
