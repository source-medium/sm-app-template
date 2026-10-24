/**
 * Server code under test, in Node and workerd: a request's headers are
 * `requestHeaders.current` (see goLive in ./live), React's per-request
 * `cache` and `requestScoped` run every call, and environment stubs, global
 * stubs and request headers reset after each test. A test of the per-request
 * sharing itself calls `vi.unmock("@/lib/request-scope")`.
 */
import { afterEach, vi } from "vitest";
import { requestHeaders } from "./live";
import { resetQueryCache, setQueryCacheEnabled } from "@/lib/data/query-cache.server";

// Feature tests script one response per query; only the cache's own tests turn the query cache on.
setQueryCacheEnabled(false);

// Keep fixture expectations independent of the customer's reporting currency.
// Currency-specific tests set their own verified code.
vi.mock("@/app.config", async (original) => {
  const config = await original<typeof import("@/app.config")>();
  return { ...config, appConfig: { ...config.appConfig, currency: null } };
});
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
vi.mock("@/lib/request-scope", () => ({
  requestScoped:
    <T>(compute: (request: Headers) => Promise<T>) =>
    async () =>
      compute(requestHeaders.current),
}));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  requestHeaders.current = new Headers();
  // The query cache outlives a request by design; a test's results must not outlive the test.
  resetQueryCache();
  setQueryCacheEnabled(false);
});
