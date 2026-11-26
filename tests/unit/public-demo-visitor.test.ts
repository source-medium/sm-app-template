/**
 * SourceMedium's public demo (docs/managed.md): DemoCo's hosted app opened
 * without sign-in. The gateway sends an anonymous `public` viewer and admits
 * only reads; the app shows reports as to anyone, and declines again the two
 * actions that bypass the shared cache and that its controls hide.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { VIEWER_HEADER } from "@/lib/auth/sourcemedium-viewer";
import { requestHeaders } from "../helpers/live";
import { contractExample } from "../helpers/managed";

const nextCache = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("next/cache", () => nextCache);

const HOST = "democo-app.apps.example";
const HOSTED = {
  SM_HOSTING: "managed",
  SM_DATA_API_URL: "https://urchin.test/api/app-data/v1",
  SM_APP_ID: "0b2c3d4e-0000-4000-8000-000000000001",
  SM_DEPLOYMENT_ID: "0b2c3d4e-0000-4000-8000-000000000d01",
};
const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
const visitor = contractExample("viewer_header", "public_demo_visitor").value;
const member = contractExample("viewer_header", "member").value;

function signIn(viewer: unknown, context: string) {
  for (const [name, value] of Object.entries(HOSTED)) vi.stubEnv(name, value);
  requestHeaders.current = new Headers({ host: HOST, origin: `https://${HOST}`, [VIEWER_HEADER]: encode(viewer) });
  const fetch = vi.fn(async (_input: RequestInfo | URL) => Response.json(contractExample("context", context).value));
  vi.stubGlobal("fetch", fetch);
  return fetch;
}

beforeEach(() => {
  nextCache.refresh.mockClear();
});

describe("a public demo visitor", () => {
  it("reads through the live warehouse as an anonymous viewer", async () => {
    signIn(visitor, "public_demo");
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    await expect(requireViewer({ live: true })).resolves.toMatchObject({
      mode: "live",
      viewer: { kind: "sourcemedium", access: "public", userId: null, email: null, name: null },
    });
  });

  it("never refreshes, while a member does", async () => {
    const { requestRefresh } = await import("@/lib/refresh");
    signIn(visitor, "public_demo");
    await requestRefresh();
    expect(nextCache.refresh).not.toHaveBeenCalled();
    signIn(member, "viewer");
    await requestRefresh();
    expect(nextCache.refresh).toHaveBeenCalledOnce();
  });

  it("cannot run the connection check", async () => {
    const fetch = signIn(visitor, "public_demo");
    const { POST } = await import("@/app/(app)/connection/check/route");
    const response = await POST(
      new Request(`https://${HOST}/connection/check`, { method: "POST", headers: { origin: `https://${HOST}` } }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ error: "The public demo does not run connection checks." });
    // Only the data context was read; no warehouse check ran.
    expect(fetch.mock.calls.map(([url]) => String(url))).toEqual(["https://urchin.test/api/app-data/v1/context"]);
  });
});
