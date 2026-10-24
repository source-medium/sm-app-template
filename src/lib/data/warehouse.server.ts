/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * Binds validated live configuration to the REST client, or a managed app's
 * context to SourceMedium's data API. Pages get a Warehouse only through
 * requireViewer(); there is no other route from a request to the warehouse.
 */
import "server-only";
import { BIGQUERY_IDENTIFIER, buildId, deploymentEnvironment, type LiveConfig } from "@/lib/config/env.server";
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
import { cachedQuery, type CacheScope } from "./query-cache.server";
import { newRequestContext, type RequestContext } from "./request-context";
import type { ConnectionReport } from "./connection-report";
import type { WarehouseError } from "./warehouse-error";

/** The deployment boundary a cached result belongs to; the environment keeps previews apart from production. */
const environment = deploymentEnvironment;

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

/**
 * `request` is the current request's context (requireViewer() supplies it);
 * scripts and tests may omit it and get a fresh one that never bypasses the cache.
 */
export function warehouseFor(
  live: LiveConfig,
  fixedStoreId: string | null = null,
  request: RequestContext = newRequestContext(),
): Warehouse {
  const client = bigQueryClientFor(live);
  const scope: CacheScope = {
    source: "bigquery",
    environment: environment(),
    applicationId: live.applicationId,
    projectId: live.dataProjectId,
    transformedDatasetId: live.transformedDatasetId,
    metadataDatasetId: live.metadataDatasetId,
  };
  const warehouse: Warehouse = {
    applicationId: live.applicationId,
    table: tableIn({
      projectId: live.dataProjectId,
      transformedDatasetId: live.transformedDatasetId,
      metadataDatasetId: live.metadataDatasetId,
    }),
    query: async (query, options = {}) => {
      if (fixedStoreId !== null) {
        const parameters = query.params?.filter((param) => param.name === "store_id") ?? [];
        const parameter = parameters[0];
        if (parameters.length !== 1 || parameter?.type !== "STRING" || typeof parameter.value !== "string") {
          throw new StoreAccessError();
        }
        assertStoreAccess(fixedStoreId, parameter.value);
      }
      return cachedQuery(scope, request, query, options, (traced) => runQuery(client, query, traced));
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
export function managedWarehouse(
  client: ManagedApiClient,
  context: ManagedContext,
  request: RequestContext = newRequestContext(),
): Warehouse {
  const scope: CacheScope = {
    source: "managed",
    environment: environment(),
    applicationId: context.appId,
    projectId: context.projectId,
    transformedDatasetId: context.transformedDatasetId,
    metadataDatasetId: context.metadataDatasetId,
    allowedDatasets: context.allowedDatasets,
  };
  const warehouse: Warehouse = {
    applicationId: context.appId,
    table: tableIn(context),
    query: (query, options = {}) =>
      cachedQuery(scope, request, query, options, (traced) => runManagedQuery(client, query, traced)),
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

/**
 * A managed app whose data context the data API refused (app paused, access
 * changed) or could not answer. Every read raises that error, so views,
 * exports and the connection check report it where they already report a
 * warehouse failure, and nothing falls back to sample data.
 */
export function refusedWarehouse(refusal: WarehouseError): Warehouse {
  return {
    applicationId: "", // No context was loaded, so there is no app id.
    table: () => {
      throw refusal;
    },
    query: () => Promise.reject(refusal),
    checkConnection: async () => ({
      mode: "live",
      checks: [
        {
          name: "SourceMedium data API",
          status: "fail",
          message: `${refusal.title}. ${refusal.remedy}`,
          ...(refusal.requestId ? { requestId: refusal.requestId } : {}),
        },
      ],
    }),
  };
}
