/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * The client for SourceMedium's data API, used when SourceMedium manages the
 * app (docs/managed.md). The server owns the credential, the job location,
 * the read-only check and the dataset scope; this client sends the query and
 * its typed parameters and reads the result in the same shape the BigQuery
 * client returns, so every feature's queries and decoders work unchanged.
 * The wire contract is contracts/managed-app-v1/, vendored from SourceMedium.
 *
 *   - GET /context: the app, its dataset roles and limits. Idempotent, so a
 *     transport failure or 5xx retries once within the deadline.
 *   - POST /query: sent once. A lost response is an indeterminate submission,
 *     never resent, matching the BigQuery client.
 */
import "server-only";
import { z } from "zod";
import { logEvent } from "./log";
import type {
  BigQueryField,
  JobReference,
  QueryOptions,
  QueryParameter,
  QueryRequest,
  QueryResult,
} from "./bigquery-rest.server";
import { WarehouseError, type WarehouseErrorKind } from "./warehouse-error";

const DEFAULT_DEADLINE_MS = 35_000; // The server stops at 30 s; leave room to hear it say so.
const DEFAULT_MAX_ROWS = 1000;
const MAX_ROWS_LIMIT = 10_000;
const MAX_RESPONSE_BYTES = 12 * 1024 * 1024; // 10 MiB of rows plus the envelope.
const QUERY_NAME = /^[a-z][a-z0-9_-]{0,62}$/;
const CONTRACT_VERSION = 1;

export type ManagedApiClient = {
  /** The data API root, ending in /api/app-data/v1. */
  dataApiUrl: string;
  /** Null when the environment's proxy adds the Authorization header. */
  developerToken: string | null;
  buildId?: string;
  /** Test seams; production uses the platform's fetch and clock. */
  fetch?: typeof fetch;
  now?: () => number;
};

/** What the adapter needs from /context: dataset roles are explicit, never inferred. */
export type ManagedContext = {
  appId: string;
  projectId: string;
  transformedDatasetId: string;
  metadataDatasetId: string;
  allowedDatasets: readonly string[];
};

const field: z.ZodType<BigQueryField> = z.lazy(() =>
  z.object({
    name: z.string(),
    type: z.string(),
    mode: z.string(),
    fields: z.array(field).optional(),
  }),
);
const cell: z.ZodType<unknown> = z.lazy(() =>
  z.union([z.string(), z.null(), z.array(cell), z.record(z.string(), cell)]),
);

const queryResponse = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  request_id: z.string(),
  fields: z.array(field),
  rows: z.array(z.record(z.string(), cell)),
  truncated: z.boolean(),
  receipt: z.object({
    job: z.object({ project_id: z.string(), job_id: z.string(), location: z.string() }).nullable(),
    query_id: z.string().nullable(),
    bytes_billed: z.string().nullable(),
    cache_hit: z.boolean().nullable(),
  }),
});

const contextResponse = z.object({
  contract_version: z.literal(CONTRACT_VERSION),
  app: z.object({ id: z.string(), name: z.string() }),
  warehouse: z.object({
    project_id: z.string(),
    transformed_dataset: z.string(),
    metadata_dataset: z.string(),
    allowed_datasets: z.array(z.string()),
  }),
});

const errorResponse = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    retryable: z.boolean(),
    request_id: z.string(),
    reason: z.string().optional(),
    retry_after_seconds: z.number().optional(),
  }),
});

/**
 * A wire error as the WarehouseError the views already handle. Remedies name
 * the managed fix, never Google's. Only the server's typed
 * `relation_not_found` becomes `not_found` without a job, which is what the
 * optional-table fallbacks read; its copy is never parsed.
 */
export function managedApiError(status: number, body: unknown): WarehouseError {
  const parsed = errorResponse.safeParse(body);
  if (!parsed.success) {
    const kind: WarehouseErrorKind =
      status === 401
        ? "credential_invalid"
        : status === 403
          ? "permission_denied"
          : status === 429
            ? "quota_exceeded"
            : status >= 500
              ? "transient"
              : "response_invalid";
    return new WarehouseError(kind, { status, reason: "data_api_unreadable" });
  }
  const { code, message, retryable, reason, retry_after_seconds } = parsed.data.error;
  const base = { status, reason: code.toLowerCase() };
  switch (code) {
    case "TOKEN_INVALID":
      return new WarehouseError("credential_invalid", {
        ...base,
        remedy:
          "SourceMedium did not accept the developer token: it expired, was revoked, or was copied incompletely. Create a new token in your app's Agent setup and replace SM_DEVELOPER_TOKEN (docs/managed.md#token-expired).",
      });
    case "ACCESS_DENIED":
      return new WarehouseError("permission_denied", {
        ...base,
        remedy:
          "SourceMedium refused this token: its creator may no longer manage the workspace, or the app is paused or removed. Ask a workspace admin (docs/managed.md).",
      });
    case "INVALID_REQUEST":
      return reason === "relation_not_found"
        ? new WarehouseError("not_found", {
            ...base,
            reason: "relation_not_found",
            job: null,
            remedy:
              "The table does not exist in your SourceMedium datasets. Check its name with `pnpm schema <relation>`.",
          })
        : new WarehouseError("invalid_query", { ...base, detail: message.slice(0, 500), remedy: SQL_REMEDY });
    case "QUERY_NOT_READ_ONLY":
    case "QUERY_SCOPE_DENIED":
      return new WarehouseError("invalid_query", { ...base, detail: message.slice(0, 500), remedy: SQL_REMEDY });
    case "QUERY_TOO_EXPENSIVE":
      return new WarehouseError("bytes_limit_exceeded", {
        ...base,
        remedy:
          "This query would scan more than SourceMedium's per-query limit. Narrow the date range or aggregate earlier.",
      });
    case "QUERY_TIMEOUT":
      return new WarehouseError("deadline_exceeded", base);
    case "RESULT_TOO_LARGE":
      return new WarehouseError("result_too_large", base);
    case "RATE_LIMITED":
      return new WarehouseError("quota_exceeded", {
        ...base,
        remedy: `SourceMedium is limiting this app's request rate. Wait ${retry_after_seconds ?? 60} seconds, then reload.`,
      });
    case "SOURCE_UNAVAILABLE":
      return new WarehouseError(retryable ? "transient" : "permission_denied", {
        ...base,
        remedy:
          "SourceMedium cannot reach this app's warehouse right now. Reload in a minute; if it persists, contact SourceMedium support.",
      });
    case "PROVIDER_ERROR":
      return retryable
        ? new WarehouseError("transient", { ...base, remedy: TRANSIENT_REMEDY })
        : new WarehouseError("submission_indeterminate", base);
    case "INTERNAL_ERROR":
      return new WarehouseError("transient", { ...base, remedy: TRANSIENT_REMEDY });
  }
  return new WarehouseError("unknown", base);
}

const SQL_REMEDY = "SourceMedium rejected the SQL. Inspect the table with `pnpm schema <relation>` and fix the query.";
const TRANSIENT_REMEDY = "SourceMedium's data API returned a temporary error. Reload in a minute.";

/** The wire form of a parameter: INT64 as a decimal string, so no precision is lost. */
function toWireParameter(parameter: QueryParameter): Record<string, unknown> {
  if (parameter.type === "INT64") {
    if (typeof parameter.value === "number" && !Number.isSafeInteger(parameter.value)) {
      throw new Error(`INT64 parameter "${parameter.name}" is not a safe integer; pass a bigint.`);
    }
    return { name: parameter.name, type: "INT64", value: String(parameter.value) };
  }
  return { name: parameter.name, type: parameter.type, value: parameter.value };
}

/** The exact /query body for a request; exported for the contract test. */
export function queryBody(request: QueryRequest): Record<string, unknown> {
  return {
    contract_version: CONTRACT_VERSION,
    name: request.name,
    sql: request.sql,
    params: (request.params ?? []).map(toWireParameter),
    max_rows: Math.min(Math.max(1, request.maxRows ?? DEFAULT_MAX_ROWS), MAX_ROWS_LIMIT),
    partial: request.partial ?? false,
  };
}

export async function runManagedQuery(
  client: ManagedApiClient,
  request: QueryRequest,
  options: QueryOptions = {},
): Promise<QueryResult> {
  if (!QUERY_NAME.test(request.name)) {
    throw new Error(`Query name "${request.name}" must be lowercase letters, digits, - or _.`);
  }
  // Serialized before the call: a bad parameter is the caller's bug, not a transport failure.
  const body = JSON.stringify(queryBody(request));
  const call = new Call(client, options);
  let result: QueryResult | null = null;
  let failure: WarehouseError | null = null;
  try {
    let response: Response;
    try {
      response = await call.fetch("/query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
      });
    } catch (error) {
      if (call.signal.aborted) throw call.signal.reason;
      void error; // The server may have received it: never resent.
      throw new WarehouseError("submission_indeterminate", { reason: "data_api_no_response" });
    }
    const answer = await call.readJson(response).catch((error: unknown) => {
      if (error instanceof WarehouseError) throw error;
      if (call.signal.aborted) throw call.signal.reason;
      return undefined;
    });
    if (!response.ok) {
      throw answer === undefined && response.status >= 500
        ? new WarehouseError("submission_indeterminate", { status: response.status, reason: "data_api_server_error" })
        : managedApiError(response.status, answer);
    }
    const parsed = queryResponse.safeParse(answer);
    if (!parsed.success) throw new WarehouseError("response_invalid", { reason: "data_api_query_shape" });
    const { receipt } = parsed.data;
    const job: JobReference | null = receipt.job
      ? { projectId: receipt.job.project_id, jobId: receipt.job.job_id, location: receipt.job.location }
      : null;
    result = {
      fields: parsed.data.fields,
      rows: parsed.data.rows,
      truncated: parsed.data.truncated,
      job,
      bytesBilled: receipt.bytes_billed,
      cacheHit: receipt.cache_hit,
    };
    return result;
  } catch (error) {
    failure = WarehouseError.fromTransport(error, "data_api_query");
    throw failure;
  } finally {
    call.dispose();
    logEvent({
      event: "bq_query",
      level: failure && !(options.missingRelationOk && failure.kind === "not_found") ? "warn" : "info",
      build: client.buildId,
      query: request.name,
      job_project: result?.job?.projectId ?? null,
      job_id: result?.job?.jobId ?? null,
      location: result?.job?.location ?? null,
      duration_ms: call.elapsedMs(),
      bytes_billed: result?.bytesBilled ?? null,
      cache_hit: result?.cacheHit ?? null,
      rows: result?.rows.length ?? null,
      truncated: result?.truncated ?? null,
      error_kind: failure?.kind ?? null,
      error_reason: failure?.reason ?? null,
      http_status: failure?.status ?? null,
    });
  }
}

/** This request's app and dataset roles. A failure is an explicit error, never sample data. */
export async function loadManagedContext(
  client: ManagedApiClient,
  options: QueryOptions = {},
): Promise<ManagedContext> {
  const call = new Call(client, options);
  try {
    for (let attempt = 0; ; attempt += 1) {
      let response: Response | null = null;
      try {
        response = await call.fetch("/context", { method: "GET" });
      } catch (error) {
        if (call.signal.aborted) throw call.signal.reason;
        if (attempt > 0) throw WarehouseError.fromTransport(error, "data_api_context");
        continue;
      }
      const body = await call.readJson(response).catch((error: unknown) => {
        if (error instanceof WarehouseError) throw error;
        if (call.signal.aborted) throw call.signal.reason;
        return undefined;
      });
      if (!response.ok) {
        if (attempt === 0 && response.status >= 500) continue;
        throw managedApiError(response.status, body);
      }
      const parsed = contextResponse.safeParse(body);
      if (!parsed.success) throw new WarehouseError("response_invalid", { reason: "data_api_context_shape" });
      const { app, warehouse } = parsed.data;
      return {
        appId: app.id,
        projectId: warehouse.project_id,
        transformedDatasetId: warehouse.transformed_dataset,
        metadataDatasetId: warehouse.metadata_dataset,
        allowedDatasets: warehouse.allowed_datasets,
      };
    }
  } catch (error) {
    throw WarehouseError.fromTransport(error, "data_api_context");
  } finally {
    call.dispose();
  }
}

/** One deadline and abort signal for a single data API call. */
class Call {
  private readonly controller = new AbortController();
  private readonly startedAt: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly unlink: () => void;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;

  constructor(
    private readonly client: ManagedApiClient,
    options: QueryOptions,
  ) {
    this.fetchImpl = client.fetch ?? globalThis.fetch;
    this.now = client.now ?? Date.now;
    this.startedAt = this.now();
    const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    this.timer = setTimeout(
      () => this.controller.abort(new DOMException("Deadline exceeded", "TimeoutError")),
      deadlineMs,
    );
    const callerSignal = options.signal;
    const onAbort = () => this.controller.abort(new DOMException("Cancelled", "AbortError"));
    if (callerSignal?.aborted) onAbort();
    callerSignal?.addEventListener("abort", onAbort, { once: true });
    this.unlink = () => callerSignal?.removeEventListener("abort", onAbort);
  }

  get signal(): AbortSignal {
    return this.controller.signal;
  }

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.unlink();
  }

  /** Sends the token only when one is configured; a cloud proxy may add it instead. */
  fetch(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set("Accept", "application/json");
    if (this.client.developerToken) headers.set("Authorization", `Bearer ${this.client.developerToken}`);
    return this.fetchImpl(`${this.client.dataApiUrl}${path}`, {
      ...init,
      headers,
      // Never followed: a redirect reads as an unexpected response.
      redirect: "manual",
      signal: this.signal,
    });
  }

  async readJson(response: Response): Promise<unknown> {
    const reader = response.body?.getReader();
    if (!reader) throw new SyntaxError("Empty response body");
    const decoder = new TextDecoder();
    const chunks: string[] = [];
    let bytes = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        bytes += value.byteLength;
        if (bytes > MAX_RESPONSE_BYTES) {
          await reader.cancel();
          throw new WarehouseError("result_too_large", { reason: "response_bytes" });
        }
        chunks.push(decoder.decode(value, { stream: true }));
      }
      chunks.push(decoder.decode());
      return JSON.parse(chunks.join(""));
    } finally {
      reader.releaseLock();
    }
  }
}
