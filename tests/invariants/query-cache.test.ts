/**
 * The query cache inside the Warehouse: what it serves, what it never stores,
 * and how a refresh bypasses it. Runs in Node and workerd through the real
 * requireViewer(), REST client and fake BigQuery.
 */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../helpers/live";
import { googleError } from "../fake-bigquery/fake-bigquery";
import { requireViewer } from "@/lib/auth/require-viewer";
import { CACHE_MAX_ENTRY_BYTES, CACHE_POLICY } from "@/lib/data/query-cache";
import {
  cacheKey,
  queryCacheTiers,
  resetQueryCache,
  setQueryCacheEnabled,
  setQueryCacheStore,
  type CacheStore,
} from "@/lib/data/query-cache.server";
import { requestRefresh } from "@/lib/refresh";
import { setLogEmitter, type LogEvent } from "@/lib/data/log";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { TEST_PASSWORD } from "../helpers/service-account";

// One request's calls share one context, as in the app, so a Refresh can mark its own request.
vi.unmock("@/lib/request-scope");
// The Refresh action asks Next to re-render the page in its own response; here that is only recorded.
const nextCache = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => nextCache);

const fields = [{ name: "total", type: "NUMERIC" }];
const aggregate = (storeId = "store-a", sql = "SELECT SUM(x) AS total FROM t WHERE sm_store_id = @store_id") => ({
  name: "cache_test",
  sql,
  cache: CACHE_POLICY.aggregate,
  params: [{ name: "store_id", type: "STRING" as const, value: storeId }],
});
const lines: LogEvent[] = [];

function fakeStore(): CacheStore & { map: Map<string, { value: string; ttl: number }>; fail?: boolean } {
  const map = new Map<string, { value: string; ttl: number }>();
  const store = {
    name: "fake-kv",
    map,
    fail: false,
    async get(key: string) {
      if (store.fail) throw new Error("kv down");
      return map.get(key)?.value ?? null;
    },
    async put(key: string, value: string, ttl: number) {
      if (store.fail) throw new Error("kv down");
      map.set(key, { value, ttl });
    },
  };
  return store;
}

beforeEach(() => {
  setQueryCacheEnabled(true);
  resetQueryCache();
  setQueryCacheStore(null);
  lines.length = 0;
  setLogEmitter((line) => lines.push(JSON.parse(line) as LogEvent));
});
afterEach(() => {
  setQueryCacheStore(undefined);
  resetQueryCache();
  vi.useRealTimers();
});

async function warehouse() {
  const access = await requireViewer({ live: true });
  return access.warehouse;
}

it("serves a repeat of a cached query from memory with zero new jobs, and keeps exact wire values", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [{ total: "12345678901234567890.12" }]) });
  const first = await (await warehouse()).query(aggregate());
  expect(first.servedFrom).toBe("warehouse");
  expect(first.rows[0]?.total).toBe("12345678901234567890.12");
  // A second request: new headers object, same deployment.
  requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
  const access = await requireViewer({ live: true });
  const second = await access.warehouse.query(aggregate());
  expect(second.servedFrom).toBe("app-cache");
  expect(second.queriedAt).toBe(first.queriedAt);
  expect(second.rows).toEqual(first.rows);
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1);
  expect(lines.filter((line) => line.event === "bq_query").map((line) => line.app_cache)).toEqual(["miss"]);
  expect(lines.filter((line) => line.event === "app_cache").map((line) => line.app_cache)).toEqual(["hit"]);
  expect(access.request.provenance).toEqual({ oldestQueriedAt: first.queriedAt, servedFromCache: 1 });
});

it("runs a query without a cache policy every time, and never stores an error", async () => {
  let failNext = false;
  const fake = await goLive({
    submit: () => {
      if (failNext) {
        failNext = false;
        return googleError(500, "backendError");
      }
      return rowsResponse(fields, [{ total: "1" }]);
    },
  });
  const { cache: _omitted, ...plain } = aggregate();
  const w = await warehouse();
  await w.query(plain);
  await w.query(plain);
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(2);
  // A cached query whose first run failed is retried on the next request, not served as empty.
  failNext = true;
  await expect(w.query(aggregate())).rejects.toBeInstanceOf(WarehouseError);
  const result = await w.query(aggregate());
  expect(result.servedFrom).toBe("warehouse");
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(4);
});

it("coalesces separate concurrent requests into one job and traces every consumer", async () => {
  let release!: () => void;
  const ready = new Promise<void>((resolve) => {
    release = resolve;
  });
  const fake = await goLive({
    submit: async () => {
      await ready;
      return rowsResponse(fields, [{ total: "7" }]);
    },
  });
  const viewers = [];
  for (let i = 0; i < 3; i++) {
    requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
    viewers.push(await requireViewer({ live: true }));
  }
  const promises = viewers.map((viewer) => viewer.warehouse.query(aggregate()));
  await vi.waitFor(() => expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1));
  release();
  const results = await Promise.all(promises);
  expect(results.map((result) => result.rows[0]?.total)).toEqual(["7", "7", "7"]);
  expect(results.map((result) => result.servedFrom)).toEqual(["warehouse", "app-cache", "app-cache"]);
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1);
  expect(
    lines
      .filter((line) => line.event === "app_cache")
      .map((line) => line.app_request_id)
      .sort(),
  ).toEqual(
    viewers
      .slice(1)
      .map((viewer) => viewer.request.id)
      .sort(),
  );
  expect(lines.filter((line) => line.event === "app_cache").every((line) => line.cache_tier === "inflight")).toBe(true);
  expect(viewers.slice(1).map((viewer) => viewer.request.provenance)).toEqual(
    Array.from({ length: 2 }, () => ({ oldestQueriedAt: results[0]?.queriedAt, servedFromCache: 1 })),
  );
});

it("keys on the store, the SQL and the parameters, so another store never reads this one's result", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [{ total: "1" }]) });
  const w = await warehouse();
  await w.query(aggregate("store-a"));
  await w.query(aggregate("store-b"));
  await w.query(aggregate("store-a", "SELECT SUM(y) AS total FROM t WHERE sm_store_id = @store_id"));
  await w.query({ ...aggregate("store-a"), maxRows: 5 });
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(4);
  const scope = {
    source: "bigquery" as const,
    environment: "local",
    applicationId: "app",
    projectId: "p",
    transformedDatasetId: "t",
    metadataDatasetId: "m",
  };
  expect(await cacheKey(scope, aggregate("store-a"))).not.toBe(
    await cacheKey({ ...scope, applicationId: "other" }, aggregate("store-a")),
  );
  expect(await cacheKey(scope, aggregate("store-a"))).not.toBe(
    await cacheKey({ ...scope, environment: "production" }, aggregate("store-a")),
  );
});

it("expires entries at their policy and bypasses the cache for a Refresh", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-24T12:00:00Z"));
  const fake = await goLive({ submit: () => rowsResponse(fields, [{ total: "1" }]) });
  await (await warehouse()).query(aggregate());
  vi.setSystemTime(new Date("2026-10-24T12:04:59Z"));
  requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
  expect((await (await warehouse()).query(aggregate())).servedFrom).toBe("app-cache");
  vi.setSystemTime(new Date("2026-10-24T12:05:01Z"));
  requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
  expect((await (await warehouse()).query(aggregate())).servedFrom).toBe("warehouse");
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(2);
  // Refresh re-renders within its own request: that request runs the query again and replaces the entry.
  requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
  await requestRefresh();
  expect(nextCache.refresh).toHaveBeenCalledOnce();
  const refreshed = await requireViewer({ live: true });
  expect(refreshed.request.bypassCache).toBe(true);
  expect((await refreshed.warehouse.query(aggregate())).servedFrom).toBe("warehouse");
  expect(lines.filter((line) => line.event === "bq_query").at(-1)?.app_cache).toBe("bypass");
  // The next request is an ordinary one, served from the replaced entry.
  requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
  const next = await requireViewer({ live: true });
  expect(next.request.bypassCache).toBe(false);
  expect((await next.warehouse.query(aggregate())).servedFrom).toBe("app-cache");
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(3);
});

it("uses the shared store when one exists, survives its failure, and skips oversized results", async () => {
  const store = fakeStore();
  setQueryCacheStore(store);
  expect(queryCacheTiers()).toEqual(["memory", "fake-kv"]);
  const fake = await goLive({
    submit: (call) =>
      (call.body as { query: string }).query.includes("big")
        ? rowsResponse(
            fields,
            Array.from({ length: 20_000 }, (_, i) => ({ total: `${i}.000000000` })),
          )
        : rowsResponse(fields, [{ total: "1" }]),
  });
  const w = await warehouse();
  await w.query(aggregate());
  expect(store.map.size).toBe(1);
  expect([...store.map.values()][0]?.ttl).toBe(CACHE_POLICY.aggregate.maxAgeSeconds);
  // Another isolate: memory is empty, the shared store answers.
  resetQueryCache();
  expect((await w.query(aggregate())).servedFrom).toBe("app-cache");
  expect(lines.filter((line) => line.event === "app_cache").at(-1)?.cache_tier).toBe("fake-kv");
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1);
  // The store fails: the warehouse still answers, and the failure is a warning line, not an error page.
  resetQueryCache();
  store.fail = true;
  expect((await w.query(aggregate())).servedFrom).toBe("warehouse");
  expect(lines.filter((line) => line.event === "app_cache" && line.app_cache === "error")).toHaveLength(2);
  store.fail = false;
  // An oversized result is served but not stored anywhere.
  const big = await w.query({
    ...aggregate("store-a", "SELECT big FROM t WHERE sm_store_id = @store_id"),
    maxRows: 20_000,
    partial: true,
  });
  expect(JSON.stringify(big.rows).length).toBeGreaterThan(CACHE_MAX_ENTRY_BYTES);
  expect(lines.filter((line) => line.event === "app_cache").at(-1)?.app_cache).toBe("skip");
  expect(store.map.size).toBe(1);
});

it("on Workers, keeps a shared run and its write alive past the response and still logs a failed write", async () => {
  const work: Promise<unknown>[] = [];
  const store = fakeStore();
  setQueryCacheStore(store, (promise) => work.push(promise));
  await goLive({ submit: () => rowsResponse(fields, [{ total: "1" }]) });
  store.fail = true;
  expect((await (await warehouse()).query(aggregate())).servedFrom).toBe("warehouse");
  // The run other requests may join, and the shared-tier write, which the response does not wait for.
  expect(work).toHaveLength(2);
  await Promise.all(work);
  expect(lines.filter((line) => line.event === "app_cache" && line.error_reason === "write_failed")).toHaveLength(1);
});

it("checks the store parameter of a fixed-store deployment before any cache read", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [{ total: "1" }]) });
  vi.stubEnv("APP_STORE_ID", "store-a");
  const w = await warehouse();
  await w.query(aggregate("store-a"));
  await expect(w.query(aggregate("store-b"))).rejects.toThrow(/not available/);
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1);
});
