/** Privileged, bounded diagnostics. Requests reach this only through a guarded Warehouse. */
import "server-only";
import type { LiveConfig } from "@/lib/config/env.server";
import type { Warehouse } from "./warehouse.server";
import type { ConnectionCheck, ConnectionReport } from "./connection-report";
import { dryRunQuery, getDatasetMetadata, getTableMetadata, type BigQueryClient } from "./bigquery-rest.server";
import { readDictionary, readMetricCatalog } from "./catalog.server";
import { queryStoreRoster, ROSTER_RELATION, LEGACY_ROSTER_RELATION, storeRosterQuery } from "./store-roster.server";
import { WarehouseError } from "./warehouse-error";

export async function checkWarehouseConnection(
  live: LiveConfig,
  client: BigQueryClient,
  warehouse: Warehouse,
  storeId: string | null,
  signal: AbortSignal,
): Promise<ConnectionReport> {
  const checks: ConnectionCheck[] = [];
  const report: ConnectionReport = { mode: "live", checks };
  const step = async <T>(name: string, run: () => Promise<T>, message: string): Promise<T | null> => {
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
      checks.push({ name, status: "fail", message: `${safe.title}. ${safe.remedy}` });
      return null;
    }
  };
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
        "dim_stores is not published yet. Store IDs are available; names and brands will appear when it arrives.",
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
  // Preserve the CLI's published example-schema check without importing a removable feature.
  const table = await step(
    "Published schema",
    () => getTableMetadata(client, live.dataProjectId, live.transformedDatasetId, LEGACY_ROSTER_RELATION, { signal }),
    "The example relation's schema is readable.",
  );
  if (!table) return report;
  if (
    ["sm_store_id", "date", "order_net_revenue", "order_count", "website_sessions", "ad_clicks", "ad_spend"].some(
      (name) => !table.fields.some((field) => field.name === name),
    )
  ) {
    checks.push({
      name: "Example columns",
      status: "fail",
      message:
        "The published executive summary is missing columns required by the starter. Ask your SourceMedium admin to verify its schema.",
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
