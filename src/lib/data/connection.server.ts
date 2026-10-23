/** Privileged, bounded diagnostics. Requests reach this only through a guarded Warehouse. */
import "server-only";
import type { LiveConfig } from "@/lib/config/env.server";
import type { Warehouse } from "./warehouse.server";
import type { ConnectionCheck, ConnectionReport } from "./connection-report";
import { dryRunQuery, getDatasetMetadata, getTableMetadata, type BigQueryClient } from "./bigquery-rest.server";
import { readDictionary, readMetricCatalog } from "./catalog.server";
import { queryStoreRoster, ROSTER_RELATION, LEGACY_ROSTER_RELATION, storeRosterQuery } from "./store-roster.server";
import type { ManagedContext } from "./managed-api.server";
import { WarehouseError } from "./warehouse-error";

/**
 * One named check at a time; a failure records only the safe title and
 * remedy. A self-hosted failure gets the kind's generic remedy, since a
 * custom one may name a configured value; the data API's remedies are fixed
 * text about the managed fix, so a managed check keeps them.
 */
/**
 * `keepCopy` keeps the error's own title and remedy: the managed adapter's are
 * fixed SourceMedium copy, never provider text, and the generic copy for its
 * kind would describe the self-hosted Google path.
 */
function checkRunner(checks: ConnectionCheck[], signal: AbortSignal, keepCopy = false) {
  return async <T>(name: string, run: () => Promise<T>, message: string): Promise<T | null> => {
    try {
      signal.throwIfAborted();
      const result = await run();
      checks.push({ name, status: "pass", message });
      return result;
    } catch (error) {
      // Do not serialize provider messages, SQL, configured values, or custom remedies.
      if (!(error instanceof WarehouseError) && !signal.aborted) throw error;
      const safe = new WarehouseError(
        signal.aborted
          ? signal.reason?.name === "TimeoutError"
            ? "deadline_exceeded"
            : "cancelled"
          : (error as WarehouseError).kind,
      );
      const shown = keepCopy && !signal.aborted ? (error as WarehouseError) : safe;
      checks.push({ name, status: "fail", message: `${shown.title}. ${shown.remedy}` });
      return null;
    }
  };
}

export async function checkWarehouseConnection(
  live: LiveConfig,
  client: BigQueryClient,
  warehouse: Warehouse,
  storeId: string | null,
  signal: AbortSignal,
): Promise<ConnectionReport> {
  const checks: ConnectionCheck[] = [];
  const report: ConnectionReport = { mode: "live", checks };
  const step = checkRunner(checks, signal);
  if (
    (await step("App credential", () => client.getAccessToken(signal), "Google accepted the app credential.")) === null
  )
    return report;

  for (const [name, dataset] of [
    ["Report dataset", live.transformedDatasetId],
    ["Metadata dataset", live.metadataDatasetId],
  ] as const) {
    const meta = await step(
      name,
      () => getDatasetMetadata(client, live.dataProjectId, dataset, { signal }),
      "The dataset is readable.",
    );
    if (!meta) return report;
    if (meta.location.toLowerCase() !== live.location.toLowerCase()) {
      checks.push({
        name: "Warehouse location",
        status: "fail",
        message:
          "BIGQUERY_LOCATION does not match the dataset. Ask your SourceMedium admin to verify the issued configuration block.",
      });
      return report;
    }
  }

  const stores = await step(
    "Store access",
    () => queryStoreRoster(warehouse, storeId),
    "The app can query its store roster.",
  );
  if (!stores) return report;
  if (stores.relation !== ROSTER_RELATION)
    checks.push({
      name: "Store names",
      status: "warning",
      message:
        "Using store IDs because dim_stores was not found in the configured report dataset. Store names and website domains are optional; they are used automatically when available.",
    });
  const firstStore = stores.stores[0]?.sm_store_id;
  if (!firstStore) {
    checks.push({
      name: "Available stores",
      status: "fail",
      message:
        storeId !== null
          ? "APP_STORE_ID has no matching active store. Ask your SourceMedium admin to check the store restriction and published data."
          : "No stores are published yet. Ask your SourceMedium admin to check warehouse delivery.",
    });
    return report;
  }

  const dry = await step(
    "Query allowance",
    () => dryRunQuery(client, storeRosterQuery(warehouse, storeId, stores.relation), { signal }),
    "The example query can be planned.",
  );
  if (!dry) return report;
  if (dry.bytesProcessed > live.maxBytesBilled) {
    checks.push({
      name: "Query size",
      status: "fail",
      message:
        "The store query exceeds BIGQUERY_MAX_BYTES_BILLED. Ask your SourceMedium admin to review the limit before raising it.",
    });
    return report;
  }
  // The store list falls back to this relation. Report columns belong to each view, which names a missing one on screen.
  const table = await step(
    "Published schema",
    () => getTableMetadata(client, live.dataProjectId, live.transformedDatasetId, LEGACY_ROSTER_RELATION, { signal }),
    "The executive summary's schema is readable.",
  );
  if (!table) return report;
  if (!table.fields.some((field) => field.name === "sm_store_id")) {
    checks.push({
      name: "Store column",
      status: "fail",
      message:
        "The published executive summary has no sm_store_id column, which the store list needs. Ask your SourceMedium admin to verify its schema.",
    });
    return report;
  }
  await step(
    "Data dictionary",
    () => readDictionary(warehouse, firstStore, LEGACY_ROSTER_RELATION),
    "The data dictionary is readable.",
  );
  await step("Metric catalog", () => readMetricCatalog(warehouse, 1), "The metric catalog is readable.");
  return report;
}

/**
 * A managed app's diagnostics, all through the data API: never a Google token
 * or metadata endpoint. The context already proved the token; the roster,
 * catalog and dictionary use the normal adapter, and columns come from the
 * dataset's INFORMATION_SCHEMA, which the API admits inside the app's scope.
 */
export async function checkManagedConnection(
  context: ManagedContext,
  warehouse: Warehouse,
  signal: AbortSignal,
): Promise<ConnectionReport> {
  const checks: ConnectionCheck[] = [
    { name: "SourceMedium data API", status: "pass", message: "SourceMedium accepted this app's development session." },
  ];
  const report: ConnectionReport = { mode: "live", checks };
  const step = checkRunner(checks, signal, true);
  const stores = await step(
    "Store access",
    () => queryStoreRoster(warehouse, null),
    "The app can query its store roster.",
  );
  if (!stores) return report;
  if (stores.relation !== ROSTER_RELATION)
    checks.push({
      name: "Store names",
      status: "warning",
      message:
        "Using store IDs because dim_stores was not found in the report dataset. Store names and website domains are optional; they are used automatically when available.",
    });
  const firstStore = stores.stores[0]?.sm_store_id;
  if (!firstStore) {
    checks.push({
      name: "Available stores",
      status: "fail",
      message: "No stores are published yet. Ask your SourceMedium admin to check warehouse delivery.",
    });
    return report;
  }
  // The store list falls back to this relation. Report columns belong to each view, which names a missing one on screen.
  const columns = await step(
    "Published schema",
    () =>
      warehouse.query(
        {
          name: "connection-schema",
          sql: `SELECT column_name FROM \`${context.projectId}.${context.transformedDatasetId}.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = @table_name`,
          params: [{ name: "table_name", type: "STRING", value: LEGACY_ROSTER_RELATION }],
          maxRows: 1000,
        },
        { signal },
      ),
    "The executive summary's schema is readable.",
  );
  if (!columns) return report;
  if (!columns.rows.some((row) => row.column_name === "sm_store_id")) {
    checks.push({
      name: "Store column",
      status: "fail",
      message:
        "The published executive summary has no sm_store_id column, which the store list needs. Ask your SourceMedium admin to verify its schema.",
    });
    return report;
  }
  await step(
    "Data dictionary",
    () => readDictionary(warehouse, firstStore, LEGACY_ROSTER_RELATION),
    "The data dictionary is readable.",
  );
  await step("Metric catalog", () => readMetricCatalog(warehouse, 1), "The metric catalog is readable.");
  return report;
}
