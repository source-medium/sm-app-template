/**
 * sm-app-template integration file. Template version: 0.1.0 (unreleased).
 *
 * The query cache sits inside the Warehouse, below every feature loader and
 * after requireViewer() and the fixed-store check. A query opts in with
 * `cache: CACHE_POLICY.<kind>`; anything else runs on every request.
 *
 * Two tiers share one key and one entry shape:
 *   - memory: this isolate, bounded, with single-flight so concurrent identical
 *     requests run one warehouse job;
 *   - kv: the Worker's APP_QUERY_CACHE binding when it exists, so a result
 *     survives isolate eviction and is shared across the Worker's locations.
 * Without the binding the app runs on memory alone. Expiry is hard: nothing
 * stale is ever served, and nothing is revalidated in the background.
 *
 * Entries hold rows in BigQuery's wire format (strings), so decoders run after
 * the cache and exact decimals and integers survive it. Errors are never
 * stored. The key names the deployment, app, project, datasets, SQL, typed
 * parameters and bounds, never a viewer or a token: every signed-in viewer of
 * a deployment sees the same data (AGENTS.md), and the checks that decide who
 * is signed in and which store they may see run before this code.
 */
import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare/cloudflare-context";
import type { BigQueryField, JobReference, QueryOptions, QueryRequest, QueryResult } from "./bigquery-rest.server";
import { logEvent } from "./log";
import { CACHE_MAX_ENTRY_BYTES } from "./query-cache";
import { recordCachedResult, type RequestContext } from "./request-context";

/** What distinguishes one deployment's warehouse from another's, for the key. */
export type CacheScope = {
  source: "bigquery" | "managed";
  environment: string;
  applicationId: string;
  projectId: string;
  transformedDatasetId: string;
  metadataDatasetId: string;
  allowedDatasets?: readonly string[];
};

/** A shared tier: Cloudflare KV in production, a Map in tests. */
export type CacheStore = {
  name: string;
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ttlSeconds: number): Promise<void>;
};

export type CacheTier = "memory" | "kv" | (string & {});

type Entry = {
  contract: 1;
  fields: BigQueryField[];
  rows: Record<string, unknown>[];
  truncated: boolean;
  receipt: { job: JobReference | null; bytesBilled: string | null; cacheHit: boolean | null };
  /** Origin completion, ISO. */
  queriedAt: string;
  /** Epoch milliseconds. */
  expiresAt: number;
};

type Runtime = {
  store: CacheStore | null;
  /** Workers' waitUntil: work passed to it finishes even after the response or a client disconnect. */
  waitUntil?: (promise: Promise<unknown>) => void;
};

const ENTRY_CONTRACT = 1;
const MEMORY_MAX_ENTRIES = 200;
const MEMORY_MAX_BYTES = 8 * 1024 * 1024;
export const QUERY_CACHE_BINDING = "APP_QUERY_CACHE";

const memory = new Map<string, { entry: Entry; bytes: number }>();
let memoryBytes = 0;
const inflight = new Map<string, Promise<QueryResult>>();
/** `undefined` resolves the Worker binding on each call; a test sets a store or null. */
let runtimeOverride: Runtime | undefined;
let enabled = true;

/** Test seam: use this store as the shared tier (null for none), and optionally a Workers-style waitUntil. */
export function setQueryCacheStore(store: CacheStore | null | undefined, waitUntil?: Runtime["waitUntil"]): void {
  runtimeOverride = store === undefined ? undefined : { store, waitUntil };
}

/** Test seam: feature tests run every query; only the cache's own tests turn it on. */
export function setQueryCacheEnabled(value: boolean): void {
  enabled = value;
}

/** Test seam: forget every memory entry and in-flight run. */
export function resetQueryCache(): void {
  memory.clear();
  memoryBytes = 0;
  inflight.clear();
}

/** The part of a KVNamespace this cache uses. */
export type KvBinding = {
  get(key: string, type: "text"): Promise<string | null>;
  put(key: string, value: string, options: { expirationTtl: number }): Promise<void>;
};

/** A KV namespace as a cache store. */
export function kvCacheStore(binding: KvBinding): CacheStore {
  return {
    name: "kv",
    get: (key) => binding.get(key, "text"),
    // KV's minimum expiry is 60 seconds.
    put: (key, value, ttlSeconds) => binding.put(key, value, { expirationTtl: Math.max(60, ttlSeconds) }),
  };
}

/** The Worker's KV binding as a store, and its waitUntil; outside Workers, neither. */
function resolveRuntime(): Runtime {
  if (runtimeOverride) return runtimeOverride;
  let env: Record<string, unknown>;
  let waitUntil: Runtime["waitUntil"];
  try {
    const context = getCloudflareContext();
    env = context.env as unknown as Record<string, unknown>;
    waitUntil = context.ctx?.waitUntil?.bind(context.ctx);
  } catch {
    // Not running under OpenNext on Workers (local Node, tests): memory only.
    return { store: null };
  }
  const binding = env[QUERY_CACHE_BINDING] as KvBinding | undefined;
  if (!binding || typeof binding.get !== "function" || typeof binding.put !== "function")
    return { store: null, waitUntil };
  return { store: kvCacheStore(binding), waitUntil };
}

/** The tiers in use, for the Connection page and `pnpm diagnose`. */
export function queryCacheTiers(): CacheTier[] {
  const { store } = resolveRuntime();
  return store ? ["memory", store.name] : ["memory"];
}

/** A digest of everything that makes two results interchangeable. Never logged whole. */
export async function cacheKey(scope: CacheScope, request: QueryRequest): Promise<string> {
  const identity = JSON.stringify([
    ENTRY_CONTRACT,
    scope.source,
    scope.environment,
    scope.applicationId,
    scope.projectId,
    scope.transformedDatasetId,
    scope.metadataDatasetId,
    scope.allowedDatasets ? [...scope.allowedDatasets].sort() : null,
    request.name,
    request.sql,
    (request.params ?? []).map((parameter) => [
      parameter.name,
      parameter.type,
      typeof parameter.value === "bigint" ? parameter.value.toString() : parameter.value,
    ]),
    request.maxRows ?? null,
    request.partial ?? false,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(identity));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

function fromEntry(entry: Entry): QueryResult {
  return {
    fields: entry.fields,
    rows: entry.rows,
    truncated: entry.truncated,
    job: entry.receipt.job,
    bytesBilled: entry.receipt.bytesBilled,
    cacheHit: entry.receipt.cacheHit,
    servedFrom: "app-cache",
    queriedAt: entry.queriedAt,
  };
}

function isEntry(value: unknown): value is Entry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<Entry>;
  return (
    entry.contract === ENTRY_CONTRACT &&
    Array.isArray(entry.fields) &&
    Array.isArray(entry.rows) &&
    typeof entry.truncated === "boolean" &&
    typeof entry.queriedAt === "string" &&
    typeof entry.expiresAt === "number" &&
    !!entry.receipt &&
    typeof entry.receipt === "object"
  );
}

function remember(key: string, entry: Entry, bytes: number): void {
  const existing = memory.get(key);
  if (existing) {
    memory.delete(key);
    memoryBytes -= existing.bytes;
  }
  memory.set(key, { entry, bytes });
  memoryBytes += bytes;
  // Insertion order is recency: a hit re-inserts, so the first key is the least recently used.
  for (const [oldest, value] of memory) {
    if (memory.size <= MEMORY_MAX_ENTRIES && memoryBytes <= MEMORY_MAX_BYTES) break;
    memory.delete(oldest);
    memoryBytes -= value.bytes;
  }
}

function recall(key: string, now: number): { entry: Entry; bytes: number } | null {
  const found = memory.get(key);
  if (!found) return null;
  if (found.entry.expiresAt <= now) {
    memory.delete(key);
    memoryBytes -= found.bytes;
    return null;
  }
  remember(key, found.entry, found.bytes);
  return found;
}

/**
 * Serves `request` from the cache when it opted in and a fresh entry exists,
 * otherwise runs it through `run` and stores the result. `run` receives the
 * options with the cache outcome and request id for its log line.
 */
export async function cachedQuery(
  scope: CacheScope,
  context: RequestContext,
  request: QueryRequest,
  options: QueryOptions,
  run: (options: QueryOptions) => Promise<QueryResult>,
  now: () => number = Date.now,
): Promise<QueryResult> {
  const traced: QueryOptions = { ...options, requestId: context.id };
  if (!request.cache || !enabled) return run(traced);
  const policy = request.cache;
  const key = await cacheKey(scope, request);
  const started = now();
  const serve = (entry: Entry, tier: CacheTier): QueryResult => {
    recordCachedResult(context, entry.queriedAt);
    logEvent({
      event: "app_cache",
      level: "info",
      app: scope.applicationId,
      query: request.name,
      app_request_id: context.id,
      app_cache: "hit",
      cache_tier: tier,
      job_id: entry.receipt.job?.jobId ?? null,
      cache_hit: entry.receipt.cacheHit,
      rows: entry.rows.length,
      truncated: entry.truncated,
      duration_ms: now() - started,
    });
    return fromEntry(entry);
  };
  const { store, waitUntil } = resolveRuntime();
  if (!context.bypassCache) {
    const held = recall(key, started);
    if (held) return serve(held.entry, "memory");
    if (store) {
      try {
        const raw = await store.get(key);
        if (raw) {
          const parsed: unknown = JSON.parse(raw);
          if (isEntry(parsed) && parsed.expiresAt > now()) {
            remember(key, parsed, raw.length);
            return serve(parsed, store.name);
          }
        }
      } catch {
        logEvent({
          event: "app_cache",
          level: "warn",
          app: scope.applicationId,
          query: request.name,
          app_request_id: context.id,
          app_cache: "error",
          cache_tier: store.name,
          error_reason: "read_failed",
        });
      }
    }
    const pending = inflight.get(key);
    if (pending) return pending;
  }
  const execution = (async (): Promise<QueryResult> => {
    const result = await run({ ...traced, appCache: context.bypassCache ? "bypass" : "miss" });
    const queriedAt = new Date(now()).toISOString();
    const fresh: QueryResult = { ...result, servedFrom: "warehouse", queriedAt };
    // A truncated result reaches here only when the query declared partial, so its truncation is part of what the view shows.
    const entry: Entry = {
      contract: ENTRY_CONTRACT,
      fields: result.fields,
      rows: result.rows,
      truncated: result.truncated,
      receipt: { job: result.job, bytesBilled: result.bytesBilled, cacheHit: result.cacheHit },
      queriedAt,
      expiresAt: now() + policy.maxAgeSeconds * 1000,
    };
    const serialized = JSON.stringify(entry);
    if (serialized.length > CACHE_MAX_ENTRY_BYTES) {
      logEvent({
        event: "app_cache",
        level: "info",
        app: scope.applicationId,
        query: request.name,
        app_request_id: context.id,
        app_cache: "skip",
        rows: result.rows.length,
      });
      return fresh;
    }
    remember(key, entry, serialized.length);
    if (store) {
      const write = store.put(key, serialized, policy.maxAgeSeconds).catch(() =>
        logEvent({
          event: "app_cache",
          level: "warn",
          app: scope.applicationId,
          query: request.name,
          app_request_id: context.id,
          app_cache: "error",
          cache_tier: store.name,
          error_reason: "write_failed",
        }),
      );
      // On Workers the write finishes after the response; elsewhere it completes before the result returns.
      if (waitUntil) waitUntil(write);
      else await write;
    }
    return fresh;
  })();
  inflight.set(key, execution);
  const settle = () => {
    if (inflight.get(key) === execution) inflight.delete(key);
  };
  const settled = execution.then(settle, settle);
  // Other requests may join this run; on Workers it must outlive this request if its client disconnects.
  waitUntil?.(settled);
  return execution;
}
