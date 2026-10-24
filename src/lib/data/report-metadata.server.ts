import "server-only";
import { z } from "zod";
import { requireViewer } from "@/lib/auth/require-viewer";
import { requestScoped } from "@/lib/request-scope";
import type { PublishedMetric } from "@/lib/metric-binding";
import { dictionaryIdentity } from "./catalog.server";
import { sourceEvidence, type Availability, type SourceEvidence } from "./evidence";
import { WarehouseError } from "./warehouse-error";
import { bq, decodeRows } from "./decode";
type Warehouse = Extract<Awaited<ReturnType<typeof requireViewer>>, { mode: "live" }>["warehouse"];

const Dictionary = "dim_data_dictionary";
const Catalog = "dim_semantic_metric_catalog";
const SchemaRow = z.object({ table_name: bq.string(), column_name: bq.string(), data_type: bq.string() });
const PayloadRow = z.object({ kind: bq.string(), payload: bq.string() });
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

/** One schema probe and one batched metadata job, deduplicated within this request. */
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
    const metadataTable = warehouse.table(Dictionary, "metadata");
    const schemaTable = metadataTable.replace(/\.dim_data_dictionary`$/, ".INFORMATION_SCHEMA.COLUMNS`");
    const result = await warehouse.query(
      {
        name: "report_metadata_schema",
        maxRows: 150,
        sql: `SELECT table_name, column_name, data_type FROM ${schemaTable}
        WHERE table_name IN ('dim_data_dictionary', 'dim_semantic_metric_catalog')`,
        params: [{ name: "store_id", type: "STRING", value: storeId }],
      },
      { signal },
    );
    const columns = decodeRows(SchemaRow, result.rows, "metadata schema");
    const types = (table: string) =>
      new Map(columns.filter((row) => row.table_name === table).map((row) => [row.column_name, row.data_type]));
    const dictionary = types(Dictionary),
      catalog = types(Catalog);
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
    const branches: string[] = [];
    if (dictionaryStatus === "accessible" && sources.length)
      branches.push(`
      SELECT 'source' AS kind, TO_JSON_STRING(STRUCT(dataset_name AS dataset, table_name AS relation,
        sm_store_id AS storeId, ${optional(dictionary, "table_has_data", "BOOL")} AS hasData,
        ${optional(dictionary, "table_has_fresh_data_14d", "BOOL")} AS recentRecord,
        CAST(${optional(dictionary, "table_last_data_date", "DATE")} AS STRING) AS observedDate)) AS payload
      FROM ${metadataTable}
      WHERE sm_store_id = @store_id AND EXISTS (
        SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(@sources)) AS source
        WHERE dataset_name = JSON_VALUE(source, '$[0]') AND table_name = JSON_VALUE(source, '$[1]'))
      GROUP BY payload`);
    if (catalogStatus === "accessible") {
      const fields = [
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
      ];
      branches.push(`SELECT 'metric' AS kind, TO_JSON_STRING(STRUCT(
        ${fields.map((field) => `${optional(catalog, field)} AS ${field}`).join(", ")},
        ${optional(catalog, "has_filter", "BOOL")} AS has_filter,
        CAST(${optional(catalog, "catalog_updated_at", "TIMESTAMP")} AS STRING) AS catalog_updated_at)) AS payload
        FROM ${warehouse.table(Catalog, "metadata")}`);
    }
    if (!branches.length) return { ...empty(dictionaryStatus), catalog: catalogStatus };
    const data = await warehouse.query(
      {
        name: "report_metadata",
        maxRows: 600,
        partial: true,
        sql: `${branches.join(" UNION ALL ")} ORDER BY kind DESC, payload LIMIT 601`,
        params: [
          { name: "store_id", type: "STRING", value: storeId },
          { name: "sources", type: "STRING", value: JSON.stringify(sources) },
        ],
      },
      { signal },
    );
    const rows = decodeRows(PayloadRow, data.rows, "report metadata");
    const metrics = rows.filter((row) => row.kind === "metric").map((row) => Metric.parse(JSON.parse(row.payload)));
    const observations = rows
      .filter((row) => row.kind === "source")
      .map((row) => Observation.parse(JSON.parse(row.payload)));
    return {
      mode: "live",
      metrics,
      catalog: catalogStatus,
      truncated: data.truncated,
      sources: sources.map(([dataset, relation]) =>
        sourceEvidence(dataset, relation, storeId, observations, dictionaryStatus),
      ),
    };
  } catch (error) {
    return empty(error instanceof z.ZodError ? "incompatible" : availability(error));
  }
}
