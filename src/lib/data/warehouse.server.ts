/**
 * sm-app-template integration file. Template version: 1.0.0.
 *
 * Binds validated live configuration to the REST client. Pages get a
 * Warehouse only through requireViewer(); there is no other route from a
 * request to the warehouse.
 */
import "server-only";
import { buildId, type LiveConfig } from "@/lib/config/env.server";
import {
  runQuery,
  type BigQueryClient,
  type QueryOptions,
  type QueryRequest,
  type QueryResult,
} from "./bigquery-rest.server";
import { createTokenProvider } from "./google-token.server";

const TABLE_ID = /^[A-Za-z0-9_]{1,1024}$/;

export type Warehouse = {
  applicationId: string;
  /** Backquoted `project.dataset.table` from validated configuration, never from a browser. */
  table(name: string, dataset?: "transformed" | "metadata"): string;
  query(request: QueryRequest, options?: QueryOptions): Promise<QueryResult>;
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

export function warehouseFor(live: LiveConfig): Warehouse {
  const client = bigQueryClientFor(live);
  return {
    applicationId: live.applicationId,
    table(name, dataset = "transformed") {
      if (!TABLE_ID.test(name)) throw new Error(`"${name}" is not a valid BigQuery table name.`);
      const datasetId = dataset === "metadata" ? live.metadataDatasetId : live.transformedDatasetId;
      return `\`${live.dataProjectId}.${datasetId}.${name}\``;
    },
    query: (request, options) => runQuery(client, request, options),
  };
}
