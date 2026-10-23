/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * Binds validated live configuration to the REST client, or a managed app's
 * context to SourceMedium's data API. Pages get a Warehouse only through
 * requireViewer(); there is no other route from a request to the warehouse.
 */
import "server-only";
import { BIGQUERY_IDENTIFIER, buildId, type LiveConfig } from "@/lib/config/env.server";
import {
  runQuery,
  type BigQueryClient,
  type QueryOptions,
  type QueryRequest,
  type QueryResult,
} from "./bigquery-rest.server";
import { createTokenProvider } from "./google-token.server";
import { assertStoreAccess, StoreAccessError } from "../auth/store-access";
import { checkManagedConnection, checkWarehouseConnection } from "./connection.server";
import { runManagedQuery, type ManagedApiClient, type ManagedContext } from "./managed-api.server";
import type { ConnectionReport } from "./connection-report";

/** SourceMedium's two datasets by role, or any other dataset id in your warehouse project. */
export type DatasetName = "transformed" | "metadata" | (string & {});

export type Warehouse = {
  applicationId: string;
  /**
   * Backquoted `project.dataset.table` in your warehouse project, built from
   * code, never from a browser. `table("obt_orders")` reads SourceMedium's
   * transformed dataset; `table("dim_data_dictionary", "metadata")` the
   * metadata dataset; `table("my_table", "customized_views")` or
   * `table("customized_views.my_table")` any other dataset the app can read.
   */
  table(name: string, dataset?: DatasetName): string;
  query(request: QueryRequest, options?: QueryOptions): Promise<QueryResult>;
  checkConnection(signal?: AbortSignal): Promise<ConnectionReport>;
};

const clients = new Map<string, BigQueryClient>();

/** One client per key for the life of the isolate, so the access token is reused. */
export function bigQueryClientFor(live: LiveConfig): BigQueryClient {
  const cacheKey = [
    live.key.privateKeyId,
    live.jobProjectId,
    live.location,
    live.maxBytesBilled,
    live.applicationId,
  ].join("|");
  let client = clients.get(cacheKey);
  if (!client) {
    client = {
      applicationId: live.applicationId,
      jobProjectId: live.jobProjectId,
      location: live.location,
      maxBytesBilled: live.maxBytesBilled,
      getAccessToken: createTokenProvider(live.key),
      buildId: buildId(),
    };
    clients.set(cacheKey, client);
  }
  return client;
}

/** `table()` for one warehouse project and its two SourceMedium dataset roles. */
function tableIn(coordinates: {
  projectId: string;
  transformedDatasetId: string;
  metadataDatasetId: string;
}): Warehouse["table"] {
  return (name, dataset = "transformed") => {
    const [qualifiedDataset, qualifiedTable] = name.includes(".") ? name.split(".", 2) : [null, name];
    const datasetName = qualifiedDataset ?? dataset;
    const datasetId =
      datasetName === "transformed"
        ? coordinates.transformedDatasetId
        : datasetName === "metadata"
          ? coordinates.metadataDatasetId
          : datasetName;
    if (
      !qualifiedTable ||
      !BIGQUERY_IDENTIFIER.test(qualifiedTable) ||
      !BIGQUERY_IDENTIFIER.test(datasetId) ||
      name.split(".").length > 2
    ) {
      throw new Error(
        `"${name}" is not a valid table name; use "table", or "dataset.table" within your warehouse project.`,
      );
    }
    return `\`${coordinates.projectId}.${datasetId}.${qualifiedTable}\``;
  };
}

export function warehouseFor(live: LiveConfig, fixedStoreId: string | null = null): Warehouse {
  const client = bigQueryClientFor(live);
  const warehouse: Warehouse = {
    applicationId: live.applicationId,
    table: tableIn({
      projectId: live.dataProjectId,
      transformedDatasetId: live.transformedDatasetId,
      metadataDatasetId: live.metadataDatasetId,
    }),
    query: async (request, options) => {
      if (fixedStoreId !== null) {
        const parameters = request.params?.filter((param) => param.name === "store_id") ?? [];
        const parameter = parameters[0];
        if (parameters.length !== 1 || parameter?.type !== "STRING" || typeof parameter.value !== "string") {
          throw new StoreAccessError();
        }
        assertStoreAccess(fixedStoreId, parameter.value);
      }
      return runQuery(client, request, options);
    },
    checkConnection: (callerSignal) => {
      const timeout = AbortSignal.timeout(30_000);
      const signal = callerSignal ? AbortSignal.any([timeout, callerSignal]) : timeout;
      // Diagnostics read fixed metadata queries, including the store-free catalog.
      // The roster and dictionary explicitly receive the deployment's store scope.
      const diagnosticsWarehouse = {
        ...warehouse,
        query: (request: QueryRequest, options?: QueryOptions) => runQuery(client, request, { ...options, signal }),
      };
      return checkWarehouseConnection(live, client, diagnosticsWarehouse, fixedStoreId, signal);
    },
  };
  return warehouse;
}

/**
 * A SourceMedium-managed app's warehouse: every query goes through the data
 * API, which owns the credential, the job location and the dataset scope.
 * The app reads every store in its organization, so there is no store
 * restriction to enforce here.
 */
export function managedWarehouse(client: ManagedApiClient, context: ManagedContext): Warehouse {
  const warehouse: Warehouse = {
    applicationId: context.appId,
    table: tableIn(context),
    query: (request, options) => runManagedQuery(client, request, options),
    checkConnection: (callerSignal) => {
      const timeout = AbortSignal.timeout(30_000);
      const signal = callerSignal ? AbortSignal.any([timeout, callerSignal]) : timeout;
      const diagnosticsWarehouse = {
        ...warehouse,
        query: (request: QueryRequest, options?: QueryOptions) =>
          runManagedQuery(client, request, { ...options, signal }),
      };
      return checkManagedConnection(context, diagnosticsWarehouse, signal);
    },
  };
  return warehouse;
}
