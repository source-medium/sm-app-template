/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * Binds validated live configuration to the REST client. Pages get a
 * Warehouse only through requireViewer(); there is no other route from a
 * request to the warehouse.
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
import { checkWarehouseConnection } from "./connection.server";
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

export function warehouseFor(live: LiveConfig, fixedStoreId: string | null = null): Warehouse {
  const client = bigQueryClientFor(live);
  const warehouse: Warehouse = {
    applicationId: live.applicationId,
    table(name, dataset = "transformed") {
      const [qualifiedDataset, qualifiedTable] = name.includes(".") ? name.split(".", 2) : [null, name];
      const datasetName = qualifiedDataset ?? dataset;
      const datasetId =
        datasetName === "transformed"
          ? live.transformedDatasetId
          : datasetName === "metadata"
            ? live.metadataDatasetId
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
      return `\`${live.dataProjectId}.${datasetId}.${qualifiedTable}\``;
    },
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
