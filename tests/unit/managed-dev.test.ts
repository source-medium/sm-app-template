/**
 * Managed development end to end in the server: requireViewer loads the
 * data API context once per request and hands features an ordinary live
 * Warehouse, only on this computer; middleware refuses anything else first.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { isLoopbackRequest } from "@/lib/auth/loopback";
import { managedNodeEnvironment, managedServerBindingRefusal } from "../../scripts/managed-node.mjs";
import { requestHeaders } from "../helpers/live";

const examples = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../contracts/managed-app-v1/examples.json", import.meta.url)), "utf8"),
) as { context: { valid: { case: string; value: unknown }[] } };
const CONTEXT = examples.context.valid.find((entry) => entry.case === "developer_token")?.value;
if (!CONTEXT) throw new Error("the vendored contract has no developer_token context example");

const TOKEN = `smapp_${"c".repeat(43)}`;

function managedEnv() {
  vi.stubEnv("SM_HOSTING", "managed-dev");
  vi.stubEnv("SM_DATA_API_URL", "https://urchin.test/api/app-data/v1");
  vi.stubEnv("SM_DEVELOPER_TOKEN", TOKEN);
}

/** A request from this computer whose data context the data API refuses. */
function refusedContext(status: number, code: string) {
  managedEnv();
  requestHeaders.current = new Headers({ host: "127.0.0.1:3000", origin: "http://127.0.0.1:3000" });
  vi.stubGlobal(
    "fetch",
    vi.fn(async () =>
      Response.json({ error: { code, message: "Refused.", retryable: false, request_id: "r" } }, { status }),
    ),
  );
}

describe("requireViewer in managed development", () => {
  it("hands features a live Warehouse over the data API", async () => {
    managedEnv();
    requestHeaders.current = new Headers({ host: "127.0.0.1:3000" });
    const fetch = vi.fn(async () => Response.json(CONTEXT));
    vi.stubGlobal("fetch", fetch);
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    const access = await requireViewer({ live: true });
    expect(access).toMatchObject({ mode: "live", viewer: { kind: "developer" }, storeId: null });
    expect(access.warehouse.applicationId).toBe("0b2c3d4e-0000-4000-8000-000000000001");
    expect(access.warehouse.table("obt_orders")).toBe("`sm-acme.sm_transformed_v2.obt_orders`");
    expect(access.warehouse.table("dim_data_dictionary", "metadata")).toBe("`sm-acme.sm_metadata.dim_data_dictionary`");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refuses a request that did not come from this computer, before calling SourceMedium", async () => {
    managedEnv();
    requestHeaders.current = new Headers({ host: "my-app.trycloudflare.com" });
    const fetch = vi.fn();
    vi.stubGlobal("fetch", fetch);
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    await expect(requireViewer()).rejects.toThrow("not signed in");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("carries a refused token in the Warehouse: live and failing, never sample data", async () => {
    refusedContext(401, "TOKEN_INVALID");
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    const access = await requireViewer({ live: true });
    expect(access).toMatchObject({ mode: "live", refusal: { kind: "credential_invalid" } });
    expect(() => access.warehouse.table("obt_orders")).toThrow(access.refusal);
    await expect(access.warehouse.query({ name: "orders", sql: "SELECT 1" })).rejects.toBe(access.refusal);
    const report = await access.warehouse.checkConnection();
    expect(report.checks).toEqual([
      expect.objectContaining({ status: "fail", message: expect.stringContaining(access.refusal?.title ?? "") }),
    ]);
  });
});

/** Every route handler starts with an unwrapped requireViewer(), so a refused context must reach it as a response. */
describe("route handlers when SourceMedium refuses the app", () => {
  const origin = "http://127.0.0.1:3000";

  it("answers the data dictionary with the refusal and a 503", async () => {
    refusedContext(403, "ACCESS_DENIED");
    const { GET } = await import("@/app/(app)/data-dictionary/route");
    const response = await GET(new Request(`${origin}/data-dictionary?relation=obt_orders&store=s1`));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({
      error: expect.stringContaining("SourceMedium refused this app's request"),
    });
  });

  it("reports the refusal as a failed check instead of failing the request", async () => {
    refusedContext(403, "ACCESS_DENIED");
    const { POST } = await import("@/app/(app)/connection/check/route");
    const response = await POST(new Request(`${origin}/connection/check`, { method: "POST", headers: { origin } }));
    expect(response.status).toBe(200);
    const report = (await response.json()) as { checks: { status: string; message: string }[] };
    expect(report.checks).toEqual([
      expect.objectContaining({ status: "fail", message: expect.stringContaining("SourceMedium refused") }),
    ]);
  });

  it.each([
    ["overview", "@/features/overview/download"],
    ["paid marketing", "@/features/paid-marketing/download"],
    ["performance", "@/features/performance/download"],
  ])("answers the %s export with the refusal and a 503", async (_name, module) => {
    refusedContext(403, "ACCESS_DENIED");
    const { GET } = (await import(module)) as { GET: (request: Request) => Promise<Response> };
    const response = await GET(new Request(`${origin}/export?store=s1`));
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({ title: "SourceMedium refused this app's request" });
  });
});

describe("middleware in managed development", () => {
  it("serves loopback and refuses a foreign host or origin", async () => {
    managedEnv();
    const { middleware } = await import("@/middleware");
    const request = (headers: Record<string, string>) =>
      new NextRequest("http://127.0.0.1:3000/", { headers: new Headers(headers) });
    expect((await middleware(request({ host: "127.0.0.1:3000" }))).status).toBe(200);
    expect((await middleware(request({ host: "evil.example" }))).status).toBe(403);
    expect((await middleware(request({ host: "127.0.0.1:3000", origin: "https://evil.example" }))).status).toBe(403);
  });
});

describe("isLoopbackRequest", () => {
  it.each([
    [{ host: "127.0.0.1:3000" }, true],
    [{ host: "localhost:3000", origin: "http://localhost:3000" }, true],
    [{ host: "[::1]:3000" }, true],
    [{ host: "localhost.evil.example" }, false],
    [{ host: "127.0.0.1.evil.example" }, false],
    [{ host: "10.0.0.5:3000" }, false],
    [{ host: "127.0.0.1:3000", origin: "null" }, false],
    [{}, false],
  ])("%j is loopback: %s", (headers, expected) => {
    expect(isLoopbackRequest(new Headers(headers))).toBe(expected);
  });
});

describe("managed Node startup", () => {
  const proxied = { HTTPS_PROXY: "http://proxy.internal:8080", NO_PROXY: "metadata.internal" };

  it("routes Node's fetch through the environment proxy in managed development, never loopback", () => {
    expect(managedNodeEnvironment(proxied, "managed-dev")).toEqual({
      ...proxied,
      NODE_USE_ENV_PROXY: "1",
      NO_PROXY: "metadata.internal,localhost,127.0.0.1,::1",
      no_proxy: "metadata.internal,localhost,127.0.0.1,::1",
    });
  });

  it("leaves self-hosted and unproxied environments exactly as they were", () => {
    expect(managedNodeEnvironment(proxied, undefined)).toBe(proxied);
    const direct = { PATH: "/usr/bin" };
    expect(managedNodeEnvironment(direct, "managed-dev")).toBe(direct);
  });

  it("never relaxes TLS verification", () => {
    const env = managedNodeEnvironment(proxied, "managed-dev");
    expect(env).not.toHaveProperty("NODE_TLS_REJECT_UNAUTHORIZED");
  });
});

describe("managed server binding", () => {
  it.each([
    [["dev", "--hostname", "127.0.0.1", "--port", "3000"], null],
    [["dev", "-H", "localhost"], null],
    [["start", "--hostname=::1"], null],
    [["dev"], "refused"],
    [["dev", "--hostname", "0.0.0.0"], "refused"],
    [["start", "-H", "192.168.1.20"], "refused"],
  ])("next %j", (args, expected) => {
    const refusal = managedServerBindingRefusal("next", args, "managed-dev");
    expect(refusal === null ? null : "refused").toBe(expected);
  });

  it("changes nothing outside managed development or for other commands", () => {
    expect(managedServerBindingRefusal("next", ["dev"], undefined)).toBeNull();
    expect(managedServerBindingRefusal("tsx", ["scripts/diagnose.ts"], "managed-dev")).toBeNull();
    expect(managedServerBindingRefusal("next", ["build"], "managed-dev")).toBeNull();
  });
});
