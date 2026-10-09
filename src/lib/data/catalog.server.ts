/**
 * The published warehouse metadata: the data dictionary (one store's view
 * of each relation's columns) and the semantic metric catalog (store-free).
 * Both are optional inputs; a custom page can query any relation the app can
 * reach without a catalog entry.
 *
 * A metric's `calculation` is documentation of SourceMedium's definition,
 * not executable SQL. Never paste it into a query.
 */
import "server-only";
import { z } from "zod";
import { bq, decodeRows } from "./decode";
import type { Warehouse } from "./warehouse.server";
import { WarehouseError } from "./warehouse-error";

const DICTIONARY = "dim_data_dictionary";
const METRIC_CATALOG = "dim_semantic_metric_catalog";

const DictionaryRow = z.object({
  column_name: bq.string(),
  data_type: bq.string().nullable(),
  column_description: bq.string().nullable(),
  table_description: bq.string().nullable(),
});

const MetricRow = z.object({
  metric_name: bq.string(),
  metric_label: bq.string().nullable(),
  metric_description: bq.string().nullable(),
  calculation: bq.string().nullable(),
});

export type DictionaryEntry = z.output<typeof DictionaryRow>;
export type CatalogMetric = z.output<typeof MetricRow>;

/** One relation's documented columns, as published for one store. */
export async function readDictionary(
  warehouse: Warehouse,
  storeId: string,
  relation: string,
  limit = 500,
  signal?: AbortSignal,
): Promise<DictionaryEntry[]> {
  const result = await warehouse.query(
    {
      name: "data_dictionary",
      maxRows: limit,
      sql: `
      SELECT column_name, data_type, column_description, table_description
      FROM ${warehouse.table(DICTIONARY, "metadata")}
      WHERE sm_store_id = @store_id AND table_name = @relation
      ORDER BY column_name
      LIMIT @limit`,
      params: [
        { name: "store_id", type: "STRING", value: storeId },
        { name: "relation", type: "STRING", value: relation },
        { name: "limit", type: "INT64", value: limit },
      ],
    },
    { signal },
  );
  if (result.truncated) throw new WarehouseError("result_too_large");
  return decodeRows(DictionaryRow, result.rows, DICTIONARY);
}

/** The metric catalog has no store column; do not filter it by store. */
export async function readMetricCatalog(warehouse: Warehouse, limit = 500): Promise<CatalogMetric[]> {
  const result = await warehouse.query({
    name: "metric_catalog",
    maxRows: limit,
    sql: `
      SELECT metric_name, metric_label, metric_description, calculation
      FROM ${warehouse.table(METRIC_CATALOG, "metadata")}
      ORDER BY metric_name
      LIMIT @limit`,
    params: [{ name: "limit", type: "INT64", value: limit }],
  });
  return decodeRows(MetricRow, result.rows, METRIC_CATALOG);
}
