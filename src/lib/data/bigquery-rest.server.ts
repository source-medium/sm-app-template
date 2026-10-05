/**
 * sm-app-template integration file. Template version: 1.0.0.
 *
 * A thin client over the BigQuery v2 REST API:
 *   1. Submit jobs.query once, with labels, a byte ceiling, and named parameters.
 *   2. If the job is still running, poll getQueryResults for that SAME job and
 *      location. A replacement query is never submitted.
 *   3. Follow page tokens up to the row and response-size bound and report
 *      truncation explicitly.
 *   4. On deadline or cancellation, ask BigQuery to cancel a known job. That
 *      is best effort and not proof the job stopped. If the submission
 *      response is lost before a job id is known, report an indeterminate
 *      submission instead of posting again.
 * One deadline spans the token exchange, every call, and every retry.
 */
import "server-only";
import { logEvent } from "./log";
import type { TokenProvider } from "./google-token.server";
import { WarehouseError, classifyBigQueryError } from "./warehouse-error";

const API_ROOT = "https://bigquery.googleapis.com/bigquery/v2";
export const DEFAULT_DEADLINE_MS = 30_000;
export const DEFAULT_MAX_ROWS = 1000;
const MAX_ROWS_LIMIT = 10_000;
const PAGE_ROWS = 1000;
const MAX_RESPONSE_BYTES = 10 * 1024 * 1024;
const INITIAL_WAIT_MS = 4000;
const POLL_WAIT_MS = 5000;
const BACKOFF_START_MS = 200;
const BACKOFF_MAX_MS = 2000;
const CANCEL_TIMEOUT_MS = 2000;
const QUERY_NAME = /^[a-z][a-z0-9_-]{0,62}$/;

export type BigQueryClient = {
  applicationId: string;
  jobProjectId: string;
  location: string;
  maxBytesBilled: bigint;
  getAccessToken: TokenProvider;
  buildId?: string;
  /** Test seams; production uses the platform's fetch and clock. */
  fetch?: typeof fetch;
  now?: () => number;
};

export type QueryParameter =
  | { name: string; type: "STRING" | "DATE" | "TIMESTAMP"; value: string }
  | { name: string; type: "INT64"; value: bigint | number }
  | { name: string; type: "FLOAT64"; value: number }
  | { name: string; type: "BOOL"; value: boolean };

export type QueryRequest = {
  /** Becomes the `sm_query` job label; lowercase letters, digits, - and _. */
  name: string;
  sql: string;
  params?: readonly QueryParameter[];
  /** Overall row bound across pages. Defaults to 1,000. */
  maxRows?: number;
};

export type QueryOptions = { deadlineMs?: number; signal?: AbortSignal };

export type JobReference = { projectId: string; jobId: string; location: string };
export type BigQueryField = { name: string; type: string; mode?: string; fields?: BigQueryField[] };

export type QueryResult = {
  fields: BigQueryField[];
  /** Cells as BigQuery returns them: strings or null, keyed by column name. */
  rows: Record<string, unknown>[];
  truncated: boolean;
  job: JobReference | null;
  bytesBilled: string | null;
  cacheHit: boolean | null;
};

type QueryResponse = {
  jobComplete?: boolean;
  jobReference?: { projectId?: string; jobId?: string; location?: string };
  schema?: { fields?: BigQueryField[] };
  rows?: { f?: { v?: unknown }[] }[];
  pageToken?: string;
  totalBytesBilled?: string;
  totalBytesProcessed?: string;
  cacheHit?: boolean;
};

export async function runQuery(
  client: BigQueryClient,
  request: QueryRequest,
  options: QueryOptions = {},
): Promise<QueryResult> {
  if (!QUERY_NAME.test(request.name)) {
    throw new Error(`Query name "${request.name}" must be lowercase letters, digits, - or _.`);
  }
  const call = new Call(client, options);
  const maxRows = Math.min(Math.max(1, request.maxRows ?? DEFAULT_MAX_ROWS), MAX_ROWS_LIMIT);
  let job: JobReference | null = null;
  let result: QueryResult | null = null;
  let failure: WarehouseError | null = null;
  let cancel: "requested" | "failed" | null = null;

  try {
    const token = await call.token();
    const first = await call.submit(token, {
      query: request.sql,
      useLegacySql: false,
      location: client.location,
      maximumBytesBilled: client.maxBytesBilled.toString(),
      labels: { sm_app: client.applicationId, sm_query: request.name },
      timeoutMs: call.boundedWait(INITIAL_WAIT_MS),
      jobTimeoutMs: String(call.remainingMs()),
      maxResults: Math.min(maxRows, PAGE_ROWS),
      formatOptions: { useInt64Timestamp: true },
      ...(request.params?.length
        ? { parameterMode: "NAMED", queryParameters: request.params.map(toApiParameter) }
        : {}),
    });
    job = readJobReference(first, client);

    let page = first;
    while (page.jobComplete === false) {
      if (!job) throw new WarehouseError("response_invalid", { reason: "incomplete_without_job" });
      if (page !== first) await call.pause(job);
      page = await call.poll(job, {
        timeoutMs: call.boundedWait(POLL_WAIT_MS),
        maxResults: Math.min(maxRows, PAGE_ROWS),
      });
    }

    const fields = page.schema?.fields ?? first.schema?.fields ?? [];
    const rows: Record<string, unknown>[] = [];
    let bytes = 0;
    let truncated = false;
    for (;;) {
      for (const row of page.rows ?? []) {
        if (rows.length >= maxRows) {
          truncated = true;
          break;
        }
        rows.push(decodeRow(fields, row));
      }
      bytes += call.lastResponseBytes;
      if (truncated || !page.pageToken) break;
      if (rows.length >= maxRows || bytes >= MAX_RESPONSE_BYTES) {
        truncated = true;
        break;
      }
      if (!job) throw new WarehouseError("response_invalid", { reason: "page_without_job" });
      page = await call.poll(job, {
        pageToken: page.pageToken,
        maxResults: Math.min(maxRows - rows.length, PAGE_ROWS),
      });
    }

    result = {
      fields,
      rows,
      truncated,
      job,
      bytesBilled: first.totalBytesBilled ?? null,
      cacheHit: page.cacheHit ?? first.cacheHit ?? null,
    };
    return result;
  } catch (error) {
    failure = WarehouseError.fromTransport(error, "query");
    if (job && (failure.kind === "deadline_exceeded" || failure.kind === "cancelled")) {
      cancel = (await call.cancel(job)) ? "requested" : "failed";
    }
    throw failure;
  } finally {
    call.dispose();
    logEvent({
      event: "bq_query",
      level: failure ? "warn" : "info",
      build: client.buildId,
      app: client.applicationId,
      query: request.name,
      job_project: job?.projectId ?? client.jobProjectId,
      job_id: job?.jobId ?? null,
      location: job?.location ?? client.location,
      duration_ms: call.elapsedMs(),
      bytes_billed: result?.bytesBilled ?? null,
      cache_hit: result?.cacheHit ?? null,
      rows: result?.rows.length ?? null,
      truncated: result?.truncated ?? null,
      error_kind: failure?.kind ?? null,
      error_reason: failure?.reason ?? null,
      http_status: failure?.status ?? null,
      cancel,
    });
  }
}

/** Doctor only: what a query would scan, without running it. */
export async function dryRunQuery(client: BigQueryClient, request: QueryRequest): Promise<{ bytesProcessed: bigint }> {
  const call = new Call(client, {});
  try {
    const token = await call.token();
    const response = await call.submit(token, {
      query: request.sql,
      useLegacySql: false,
      location: client.location,
      dryRun: true,
      ...(request.params?.length
        ? { parameterMode: "NAMED", queryParameters: request.params.map(toApiParameter) }
        : {}),
    });
    return { bytesProcessed: BigInt(response.totalBytesProcessed ?? "0") };
  } catch (error) {
    throw WarehouseError.fromTransport(error, "dry_run");
  } finally {
    call.dispose();
  }
}

export type DatasetMetadata = { location: string };
export type TableMetadata = { type: string; location: string; fields: BigQueryField[] };

/** Doctor and `pnpm schema` only: dataset metadata, never data. */
export async function getDatasetMetadata(
  client: BigQueryClient,
  projectId: string,
  datasetId: string,
): Promise<DatasetMetadata> {
  const body = (await metadataGet(client, `/projects/${enc(projectId)}/datasets/${enc(datasetId)}`)) as {
    location?: string;
  };
  if (typeof body.location !== "string") throw new WarehouseError("response_invalid", { reason: "dataset_location" });
  return { location: body.location };
}

/** Doctor and `pnpm schema` only: a table's columns and types, never its rows. */
export async function getTableMetadata(
  client: BigQueryClient,
  projectId: string,
  datasetId: string,
  tableId: string,
): Promise<TableMetadata> {
  const body = (await metadataGet(
    client,
    `/projects/${enc(projectId)}/datasets/${enc(datasetId)}/tables/${enc(tableId)}?view=BASIC`,
  )) as { type?: string; location?: string; schema?: { fields?: BigQueryField[] } };
  return { type: body.type ?? "TABLE", location: body.location ?? "", fields: body.schema?.fields ?? [] };
}

async function metadataGet(client: BigQueryClient, path: string): Promise<unknown> {
  const call = new Call(client, {});
  try {
    return await call.getJson(`${API_ROOT}${path}`, await call.token());
  } catch (error) {
    throw WarehouseError.fromTransport(error, "metadata");
  } finally {
    call.dispose();
  }
}

/** One deadline, one abort signal, and the request bookkeeping for a single helper call. */
class Call {
  private readonly controller = new AbortController();
  private readonly startedAt: number;
  private readonly deadlineAt: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private readonly unlink: () => void;
  private tokenValue: string | null = null;
  lastResponseBytes = 0;

  constructor(
    private readonly client: BigQueryClient,
    options: QueryOptions,
  ) {
    this.fetchImpl = client.fetch ?? globalThis.fetch;
    this.now = client.now ?? Date.now;
    this.startedAt = this.now();
    const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;
    this.deadlineAt = this.startedAt + deadlineMs;
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

  remainingMs(): number {
    return Math.max(1, this.deadlineAt - this.now());
  }

  elapsedMs(): number {
    return this.now() - this.startedAt;
  }

  /** A server-side wait that always returns before the deadline. */
  boundedWait(preferredMs: number): number {
    return Math.max(0, Math.min(preferredMs, this.remainingMs() - 500));
  }

  dispose(): void {
    clearTimeout(this.timer);
    this.unlink();
  }

  async token(): Promise<string> {
    this.tokenValue ??= await this.client.getAccessToken(this.signal);
    return this.tokenValue;
  }

  /** The single POST. Any lost or ambiguous response is indeterminate, never retried. */
  async submit(token: string, body: Record<string, unknown>): Promise<QueryResponse> {
    let response: Response;
    try {
      response = await this.fetchImpl(`${API_ROOT}/projects/${enc(this.client.jobProjectId)}/queries`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: this.signal,
      });
    } catch (error) {
      if (
        (error as { name?: string } | null)?.name === "AbortError" &&
        this.controller.signal.reason?.name === "AbortError"
      ) {
        throw new WarehouseError("cancelled", { reason: "submit" });
      }
      throw new WarehouseError("submission_indeterminate", { reason: "submit_no_response" });
    }
    const parsed = await this.readJson(response).catch(() => {
      throw new WarehouseError("submission_indeterminate", { reason: "submit_unreadable", status: response.status });
    });
    if (response.ok) return parsed as QueryResponse;
    if (response.status >= 500) {
      throw new WarehouseError("submission_indeterminate", { status: response.status, reason: "submit_server_error" });
    }
    throw classifyBigQueryError(response.status, parsed);
  }

  /** getQueryResults for a known job: idempotent, so transient failures retry within the deadline. */
  async poll(
    job: JobReference,
    query: { timeoutMs?: number; maxResults?: number; pageToken?: string },
  ): Promise<QueryResponse> {
    const params = new URLSearchParams({ location: job.location, "formatOptions.useInt64Timestamp": "true" });
    if (query.timeoutMs !== undefined) params.set("timeoutMs", String(query.timeoutMs));
    if (query.maxResults !== undefined) params.set("maxResults", String(query.maxResults));
    if (query.pageToken) params.set("pageToken", query.pageToken);
    const url = `${API_ROOT}/projects/${enc(job.projectId)}/queries/${enc(job.jobId)}?${params.toString()}`;
    return (await this.getJson(url, await this.token(), job)) as QueryResponse;
  }

  async getJson(url: string, token: string, job: JobReference | null = null): Promise<unknown> {
    let backoff = BACKOFF_START_MS;
    for (;;) {
      let response: Response | null = null;
      try {
        response = await this.fetchImpl(url, { headers: { Authorization: `Bearer ${token}` }, signal: this.signal });
      } catch (error) {
        if (this.signal.aborted) throw this.signal.reason;
        void error; // A transport failure on an idempotent GET: retry below.
      }
      if (response) {
        const body = await this.readJson(response).catch(() => null);
        if (response.ok && body !== null) return body;
        if (!response.ok && response.status !== 429 && response.status < 500) {
          throw classifyBigQueryError(response.status, body, job);
        }
      }
      if (this.remainingMs() <= backoff) {
        throw new WarehouseError("deadline_exceeded", { reason: "retry_budget", job });
      }
      await sleep(backoff, this.signal);
      backoff = Math.min(backoff * 2, BACKOFF_MAX_MS);
    }
  }

  private pollBackoff = BACKOFF_START_MS;

  /** Bounded backoff between polls of a job that is still running. */
  async pause(job: JobReference): Promise<void> {
    if (this.remainingMs() <= this.pollBackoff) {
      throw new WarehouseError("deadline_exceeded", { reason: "poll_budget", job });
    }
    await sleep(this.pollBackoff, this.signal);
    this.pollBackoff = Math.min(this.pollBackoff * 2, BACKOFF_MAX_MS);
  }

  /** Best effort, outside the expired deadline, with its own short bound. */
  async cancel(job: JobReference): Promise<boolean> {
    if (!this.tokenValue) return false;
    try {
      const response = await this.fetchImpl(
        `${API_ROOT}/projects/${enc(job.projectId)}/jobs/${enc(job.jobId)}/cancel?location=${enc(job.location)}`,
        {
          method: "POST",
          headers: { Authorization: `Bearer ${this.tokenValue}` },
          signal: AbortSignal.timeout(CANCEL_TIMEOUT_MS),
        },
      );
      return response.ok;
    } catch {
      return false;
    }
  }

  private async readJson(response: Response): Promise<unknown> {
    const text = await response.text();
    this.lastResponseBytes = text.length;
    return JSON.parse(text);
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

function readJobReference(response: QueryResponse, client: BigQueryClient): JobReference | null {
  const reference = response.jobReference;
  if (!reference?.jobId) return null;
  return {
    projectId: reference.projectId ?? client.jobProjectId,
    jobId: reference.jobId,
    location: reference.location ?? client.location,
  };
}

function toApiParameter(parameter: QueryParameter) {
  return {
    name: parameter.name,
    parameterType: { type: parameter.type },
    parameterValue: { value: String(parameter.value) },
  };
}

/** BigQuery's f/v row encoding to a plain object keyed by column name. Values stay strings. */
function decodeRow(fields: BigQueryField[], row: { f?: { v?: unknown }[] }): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  fields.forEach((field, index) => {
    out[field.name] = decodeCell(field, row.f?.[index]?.v ?? null);
  });
  return out;
}

function decodeCell(field: BigQueryField, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (field.mode === "REPEATED") {
    return Array.isArray(value)
      ? value.map((item: { v?: unknown }) => decodeCell({ ...field, mode: "NULLABLE" }, item?.v ?? null))
      : [];
  }
  if ((field.type === "RECORD" || field.type === "STRUCT") && field.fields) {
    return decodeRow(field.fields, value as { f?: { v?: unknown }[] });
  }
  return value;
}

function enc(value: string): string {
  return encodeURIComponent(value);
}
