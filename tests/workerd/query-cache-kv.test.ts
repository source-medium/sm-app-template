/**
 * The query cache's shared tier on a real KV namespace (Miniflare's), in the
 * runtime Cloudflare deploys: a result written by one isolate is read by the
 * next, with KV's own expiry rules.
 */
import { env } from "cloudflare:test";
import { afterEach, beforeEach, expect, it } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../helpers/live";
import { TEST_PASSWORD } from "../helpers/service-account";
import { requireViewer } from "@/lib/auth/require-viewer";
import { CACHE_POLICY } from "@/lib/data/query-cache";
import {
  kvCacheStore,
  QUERY_CACHE_BINDING,
  queryCacheTiers,
  resetQueryCache,
  setQueryCacheEnabled,
  setQueryCacheStore,
} from "@/lib/data/query-cache.server";

type KvNamespace = Parameters<typeof kvCacheStore>[0] & { list(): Promise<{ keys: { name: string }[] }> };
const namespace = (env as Record<string, unknown>)[QUERY_CACHE_BINDING] as KvNamespace;

beforeEach(() => {
  setQueryCacheEnabled(true);
  setQueryCacheStore(kvCacheStore(namespace));
  resetQueryCache();
});
afterEach(() => setQueryCacheStore(undefined));

it("writes a cached result to KV with the policy's expiry and serves it to a fresh isolate", async () => {
  const fake = await goLive({ submit: () => rowsResponse([{ name: "total", type: "NUMERIC" }], [{ total: "42.50" }]) });
  expect(queryCacheTiers()).toEqual(["memory", "kv"]);
  const request = {
    name: "kv_cache_test",
    sql: "SELECT SUM(x) AS total FROM t WHERE sm_store_id = @store_id",
    cache: CACHE_POLICY.aggregate,
    params: [{ name: "store_id", type: "STRING" as const, value: "store-a" }],
  };
  const first = await (await requireViewer({ live: true })).warehouse.query(request);
  expect(first.servedFrom).toBe("warehouse");
  const { keys } = await namespace.list();
  expect(keys).toHaveLength(1);
  expect(keys[0]?.name).toMatch(/^[0-9a-f]{64}$/);
  // A new isolate has no memory; KV answers without a warehouse job.
  resetQueryCache();
  requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` });
  const second = await (await requireViewer({ live: true })).warehouse.query(request);
  expect(second.servedFrom).toBe("app-cache");
  expect(second.rows[0]?.total).toBe("42.50");
  expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(1);
});
