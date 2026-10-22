/**
 * Server code under test, in Node and workerd: a request's headers are
 * `requestHeaders.current` (see goLive in ./live), React's per-request
 * `cache` runs every call, and environment stubs, global stubs and request
 * headers reset after each test.
 */
import { afterEach, vi } from "vitest";
import { requestHeaders } from "./live";

// Keep fixture expectations independent of the customer's reporting currency.
// Currency-specific tests set their own verified code.
vi.mock("@/app.config", async (original) => {
  const config = await original<typeof import("@/app.config")>();
  return { ...config, appConfig: { ...config.appConfig, currency: null } };
});
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  requestHeaders.current = new Headers();
});
