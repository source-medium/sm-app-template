/**
 * requireViewer() re-derives the mode and authenticates every request; it is
 * the only way a page obtains a Warehouse.
 */
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { liveEnv, makeServiceAccountKey, TEST_PASSWORD, type TestKey } from "../helpers/service-account";

const requestHeaders = { current: new Headers() };
vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

let key: TestKey;
beforeAll(async () => {
  key = await makeServiceAccountKey();
});
afterEach(() => {
  vi.unstubAllEnvs();
  requestHeaders.current = new Headers();
});

function stubEnv(values: Record<string, string | undefined>) {
  for (const [name, value] of Object.entries(values)) vi.stubEnv(name, value ?? "");
}

const basic = (password: string) => new Headers({ authorization: `Basic ${btoa(`viewer:${password}`)}` });

describe("requireViewer", () => {
  it("serves public sample data when nothing is configured", async () => {
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    await expect(requireViewer()).resolves.toEqual({ mode: "sample", viewer: { kind: "public" } });
  });

  it("returns a warehouse only for an authenticated live request", async () => {
    stubEnv(liveEnv(key));
    requestHeaders.current = basic(TEST_PASSWORD);
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    const access = await requireViewer({ live: true });
    expect(access.mode).toBe("live");
    expect(access.warehouse.table("obt_orders")).toBe("`sm-demotenant.sm_transformed_v2.obt_orders`");
    expect(() => access.warehouse.table("x`; DROP")).toThrow();
  });

  it("refuses a live request with a wrong password", async () => {
    stubEnv(liveEnv(key));
    requestHeaders.current = basic("wrong-password-wrong-password-1");
    const { requireViewer, ViewerDeniedError } = await import("@/lib/auth/require-viewer");
    await expect(requireViewer()).rejects.toBeInstanceOf(ViewerDeniedError);
  });

  it("refuses everything when configuration is invalid, listing problems without values", async () => {
    stubEnv(liveEnv(key, { APP_BASIC_AUTH: undefined }));
    const { requireViewer, ConfigurationError } = await import("@/lib/auth/require-viewer");
    const error = await requireViewer().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(ConfigurationError);
    expect(JSON.stringify((error as InstanceType<typeof ConfigurationError>).problems)).not.toContain(key.base64);
  });

  it("refuses to hand a live loader sample access", async () => {
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    await expect(requireViewer({ live: true })).rejects.toThrow(/without live configuration/);
  });
});
