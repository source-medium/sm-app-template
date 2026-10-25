/** Privileged, bounded diagnostics. Requests reach this only through a guarded Warehouse. */
import "server-only";
import type { LiveConfig } from "@/lib/config/env.server";
import type { Warehouse } from "./warehouse.server";
import type { ConnectionCheck, ConnectionReport } from "./connection-report";
import { dryRunQuery, getDatasetMetadata, type BigQueryClient } from "./bigquery-rest.server";
import { readDictionary, readMetricCatalog } from "./catalog.server";
import { queryStoreRoster, ROSTER_RELATION, storeRosterQuery } from "./store-roster.server";
import { CACHE_POLICY } from "./query-cache";
import { queryCacheTiers } from "./query-cache.server";
import { WarehouseError } from "./warehouse-error";

/** Which query-cache tiers this runtime has; memory alone is a working setup, not a failure. */
function queryCacheCheck(): ConnectionCheck {
  const minutes = Math.round(CACHE_POLICY.aggregate.maxAgeSeconds / 60);
  return queryCacheTiers().includes("kv")
    ? {
        name: "Query cache",
        status: "pass",
        message: `Repeated report queries are served from this Worker's memory and its APP_QUERY_CACHE store for up to ${minutes} minutes.`,
      }
    : {
        name: "Query cache",
        status: "pass",
        message: `Repeated report queries are served from server memory for up to ${minutes} minutes. Add the APP_QUERY_CACHE KV binding to keep them across restarts and locations (docs/cloud.md#query-cache).`,
      };
}

/**
 * One named check at a time; a failure records only the safe title and
 * remedy. A self-hosted failure gets the kind's generic remedy, since a
 * custom one may name a configured value. `keepCopy` keeps the error's own
 * title and remedy instead: the managed adapter's are fixed SourceMedium
 * copy, never provider text, and the generic copy for its kind would
 * describe the self-hosted Google path.
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
      checks.push({
        name,
        status: "fail",
        message: `${shown.title}. ${shown.remedy}`,
        ...(shown.requestId ? { requestId: shown.requestId } : {}),
      });
      return null;
    }
  };
}

type Step = ReturnType<typeof checkRunner>;

/** The store roster's first store, or null once a check has failed. */
async function storeChecks(
  checks: ConnectionCheck[],
  step: Step,
  warehouse: Warehouse,
  storeId: string | null,
): Promise<string | null> {
  const stores = await step(
    "Store access",
    () => queryStoreRoster(warehouse, storeId),
    "The app can query its store roster.",
  );
  if (!stores) return null;
  const firstStore = stores[0]?.sm_store_id;
  if (!firstStore) {
    checks.push({
      name: "Available stores",
      status: "fail",
      message:
        storeId !== null
          ? "APP_STORE_ID has no matching active store. Ask your SourceMedium admin to check the store restriction and published data."
          : "No stores are published yet. Ask your SourceMedium admin to check warehouse delivery.",
    });
    return null;
  }
  return firstStore;
}

/** The published metadata. Report columns belong to each view, which names a missing one on screen. */
async function metadataChecks(
  checks: ConnectionCheck[],
  step: Step,
  warehouse: Warehouse,
  firstStore: string,
): Promise<void> {
  await step(
    "Data dictionary",
    () => readDictionary(warehouse, firstStore, ROSTER_RELATION),
    "The data dictionary is readable.",
  );
  await step("Metric catalog", () => readMetricCatalog(warehouse, 1), "The metric catalog is readable.");
  checks.push(queryCacheCheck());
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

  const firstStore = await storeChecks(checks, step, warehouse, storeId);
  if (!firstStore) return report;
  const dry = await step(
    "Query allowance",
    () => dryRunQuery(client, storeRosterQuery(warehouse, storeId), { signal }),
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
  await metadataChecks(checks, step, warehouse, firstStore);
  return report;
}

/**
 * A managed app's diagnostics, all through the data API: never a Google token
 * or metadata endpoint. The context already proved the token; the roster,
 * catalog and dictionary use the normal adapter.
 */
export async function checkManagedConnection(warehouse: Warehouse, signal: AbortSignal): Promise<ConnectionReport> {
  const checks: ConnectionCheck[] = [
    { name: "SourceMedium data API", status: "pass", message: "SourceMedium accepted this app's data access." },
  ];
  const report: ConnectionReport = { mode: "live", checks };
  const step = checkRunner(checks, signal, true);
  const firstStore = await storeChecks(checks, step, warehouse, null);
  if (firstStore) await metadataChecks(checks, step, warehouse, firstStore);
  return report;
}
