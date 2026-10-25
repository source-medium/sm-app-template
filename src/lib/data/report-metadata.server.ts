import "server-only";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/require-viewer";
import { requestScoped } from "@/lib/request-scope";
import type { PublishedMetric } from "@/lib/metric-binding";
import { DICTIONARY, METRIC_CATALOG, dictionaryIdentity } from "./catalog.server";
import { sourceEvidence, type Availability, type SourceEvidence } from "./evidence";
import { CACHE_POLICY } from "./query-cache";
import { WarehouseError } from "./warehouse-error";
import { bq, decodeRows } from "./decode";
import type { Warehouse } from "./warehouse.server";

/** The catalog read's row bound; a longer catalog is reported as partial. */
const CATALOG_LIMIT = 600;
const SchemaRow = z.object({ table_name: bq.string(), column_name: bq.string(), data_type: bq.string() });
const PayloadRow = z.object({ payload: bq.string() });
const Metric = z.object({
  metric_name: z.string(),
  metric_label: z.string().nullable(),
  metric_description: z.string().nullable(),
  calculation: z.string().nullable(),
  has_filter: z.boolean().nullable(),
  filter_condition: z.string().nullable(),
  dependent_metrics: z.string().nullable(),
  underlying_model: z.string().nullable(),
  metric_time_expression: z.string().nullable(),
  metric_time_grains: z.string().nullable(),
  value_format: z.string().nullable(),
  preferred_metric_name: z.string().nullable(),
  abbreviations_list: z.string().nullable(),
  catalog_updated_at: z.string().nullable(),
  metric_category: z.string().nullable(),
  metric_type: z.string().nullable(),
  is_abbreviation: z.boolean().nullable(),
  semantic_model_name: z.string().nullable(),
  cumulative_settings: z.string().nullable(),
});
const Observation = z.object({
  dataset: z.string(),
  relation: z.string(),
  storeId: z.string().nullable(),
  hasData: z.boolean().nullable(),
  recentRecord: z.boolean().nullable(),
  observedDate: z.string().nullable(),
});
export type ReportMetadata = {
  mode: "sample" | "live";
  metrics: PublishedMetric[];
  catalog: Availability;
  sources: SourceEvidence[];
  truncated: boolean;
};
const requests = requestScoped(async () => new Map<string, Promise<ReportMetadata>>());

/**
 * The published metadata a report needs: a schema probe, the store-free metric
 * catalog and the selected store's source observations. Deduplicated within
 * this request, and each read is cached for its own policy (schema an hour,
 * catalog fifteen minutes, observations a minute), so warm navigation runs
 * no metadata job at all.
 */
export async function loadReportMetadata(storeId: string, relations: readonly string[]): Promise<ReportMetadata> {
  const access = await requireViewer({ storeId });
  const unique = [...new Set(relations)].sort();
  if (unique.length > 12) throw new Error("A metadata request supports at most 12 sources.");
  const cache = await requests();
  const key = JSON.stringify([storeId, unique]);
  let result = cache.get(key);
  if (!result) {
    result =
      access.mode === "sample"
        ? Promise.resolve({
            mode: "sample",
            metrics: [],
            catalog: "unknown",
            sources: [],
            truncated: false,
          } as ReportMetadata)
        : readMetadata(access.warehouse, storeId, unique);
    cache.set(key, result);
  }
  return result;
}

function availability(error: unknown): Availability {
  if (!(error instanceof WarehouseError)) return "unknown";
  return error.kind === "permission_denied"
    ? "denied"
    : error.kind === "not_found"
      ? "missing"
      : error.kind === "incompatible_schema"
        ? "incompatible"
        : "unknown";
}

async function readMetadata(
  warehouse: Warehouse,
  storeId: string,
  relations: readonly string[],
): Promise<ReportMetadata> {
  const sources = relations.map((relation) => dictionaryIdentity(warehouse, relation));
  const empty = (status: Availability): ReportMetadata => ({
    mode: "live",
    metrics: [],
    catalog: status,
    sources: sources.map(([dataset, relation]) => sourceEvidence(dataset, relation, storeId, [], status)),
    truncated: false,
  });
  // Metadata never holds otherwise usable report data for the warehouse's full 30-second deadline.
  const signal = AbortSignal.timeout(2500);
  try {
    const metadataTable = warehouse.table(DICTIONARY, "metadata");
    const schemaTable = metadataTable.replace(/\.dim_data_dictionary`$/, ".INFORMATION_SCHEMA.COLUMNS`");
    // The store parameter satisfies a fixed-store deployment's check; neither metadata relation is filtered by it here.
    const storeParam = { name: "store_id", type: "STRING", value: storeId } as const;
    const result = await warehouse.query(
      {
        name: "report_metadata_schema",
        cache: CACHE_POLICY.schema,
        maxRows: 150,
        sql: `SELECT table_name, column_name, data_type FROM ${schemaTable}
        WHERE table_name IN ('${DICTIONARY}', '${METRIC_CATALOG}')`,
        params: [storeParam],
      },
      { signal },
    );
    const columns = decodeRows(SchemaRow, result.rows, "metadata schema");
    const types = (table: string) =>
      new Map(columns.filter((row) => row.table_name === table).map((row) => [row.column_name, row.data_type]));
    const dictionary = types(DICTIONARY),
      catalog = types(METRIC_CATALOG);
    const compatible = (actual: Map<string, string>, required: Record<string, string>): Availability =>
      !actual.size
        ? "missing"
        : Object.entries(required).every(([name, type]) => actual.get(name) === type)
          ? "accessible"
          : "incompatible";
    const dictionaryStatus = compatible(dictionary, {
      sm_store_id: "STRING",
      dataset_name: "STRING",
      table_name: "STRING",
    });
    const catalogStatus = compatible(catalog, { metric_name: "STRING", calculation: "STRING" });
    // An absent optional field is NULL. A present wrong type is incompatible, never permission fallback.
    const optional = (actual: Map<string, string>, name: string, type = "STRING") => {
      if (actual.has(name) && actual.get(name) !== type) throw WarehouseError.incompatible("metadata", name);
      return actual.has(name) ? name : `CAST(NULL AS ${type})`;
    };
    // Two independent reads with different lifetimes: the store-free catalog changes with a
    // SourceMedium release; the selected store's observations change with each delivery.
    const observationsRead =
      dictionaryStatus === "accessible" && sources.length
        ? warehouse.query(
            {
              name: "report_metadata_sources",
              cache: CACHE_POLICY.observation,
              maxRows: 200,
              sql: `SELECT TO_JSON_STRING(STRUCT(dataset_name AS dataset, table_name AS relation,
        sm_store_id AS storeId, ${optional(dictionary, "table_has_data", "BOOL")} AS hasData,
        ${optional(dictionary, "table_has_fresh_data_14d", "BOOL")} AS recentRecord,
        CAST(${optional(dictionary, "table_last_data_date", "DATE")} AS STRING) AS observedDate)) AS payload
      FROM ${metadataTable}
      WHERE sm_store_id = @store_id AND EXISTS (
        SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(@sources)) AS source
        WHERE dataset_name = JSON_VALUE(source, '$[0]') AND table_name = JSON_VALUE(source, '$[1]'))
      GROUP BY payload ORDER BY payload`,
              params: [storeParam, { name: "sources", type: "STRING", value: JSON.stringify(sources) }],
            },
            { signal },
          )
        : null;
    const catalogRead =
      catalogStatus === "accessible"
        ? warehouse.query(
            {
              name: "report_metadata_catalog",
              cache: CACHE_POLICY.catalog,
              maxRows: CATALOG_LIMIT,
              partial: true,
              sql: `SELECT TO_JSON_STRING(STRUCT(
        ${[
          "metric_name",
          "metric_label",
          "metric_description",
          "calculation",
          "filter_condition",
          "dependent_metrics",
          "underlying_model",
          "metric_time_expression",
          "metric_time_grains",
          "value_format",
          "preferred_metric_name",
          "abbreviations_list",
          "metric_category",
          "metric_type",
          "semantic_model_name",
          "cumulative_settings",
        ]
          .map((field) => `${optional(catalog, field)} AS ${field}`)
          .join(", ")},
        ${optional(catalog, "has_filter", "BOOL")} AS has_filter,
        ${optional(catalog, "is_abbreviation", "BOOL")} AS is_abbreviation,
        CAST(${optional(catalog, "catalog_updated_at", "TIMESTAMP")} AS STRING) AS catalog_updated_at)) AS payload
        FROM ${warehouse.table(METRIC_CATALOG, "metadata")} ORDER BY payload LIMIT ${CATALOG_LIMIT + 1}`,
              params: [storeParam],
            },
            { signal },
          )
        : null;
    if (!observationsRead && !catalogRead) return { ...empty(dictionaryStatus), catalog: catalogStatus };
    const [observationsData, catalogData] = await Promise.all([observationsRead, catalogRead]);
    const metrics = catalogData
      ? decodeRows(PayloadRow, catalogData.rows, "metric catalog").map((row) => Metric.parse(JSON.parse(row.payload)))
      : [];
    const observations = observationsData
      ? decodeRows(PayloadRow, observationsData.rows, "source metadata").map((row) =>
          Observation.parse(JSON.parse(row.payload)),
        )
      : [];
    return {
      mode: "live",
      metrics,
      catalog: catalogStatus,
      truncated: catalogData?.truncated ?? false,
      sources: sources.map(([dataset, relation]) =>
        sourceEvidence(dataset, relation, storeId, observations, dictionaryStatus),
      ),
    };
  } catch (error) {
    return empty(error instanceof z.ZodError ? "incompatible" : availability(error));
  }
}
