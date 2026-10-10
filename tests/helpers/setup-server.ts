/**
 * Server code under test, in Node and workerd: a request's headers are
 * `requestHeaders.current` (see goLive in ./live), React's per-request
 * `cache` runs every call, and environment stubs, global stubs and request
 * headers reset after each test.
 */
import { afterEach, vi } from "vitest";
import { requestHeaders } from "./live";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  requestHeaders.current = new Headers();
});
