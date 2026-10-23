/**
 * requireViewer() decides once per request, wherever the request runs, and
 * only for that request. Every layer of a route handler calls it, and React's
 * `cache` does not span a route handler, so without requestScoped a managed
 * app paid a data API round trip per layer (five for a CSV export). The
 * decision is a function of the request's own headers: a denial never
 * outlives its request, and neither does an approval.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { VIEWER_HEADER } from "@/lib/auth/sourcemedium-viewer";
import { requestHeaders } from "../helpers/live";
import { TEST_PASSWORD } from "../helpers/service-account";

vi.unmock("@/lib/request-scope");

type Example = { case: string; value: Record<string, unknown> };
const examples = JSON.parse(
  readFileSync(fileURLToPath(new URL("../../contracts/managed-app-v1/examples.json", import.meta.url)), "utf8"),
) as { context: { valid: Example[] }; viewer_header: { valid: Example[] } };
const context = examples.context.valid.find((entry) => entry.case === "developer_token")?.value;
if (!context) throw new Error("the vendored contract has no developer_token context example");
const [ana, agency] = examples.viewer_header.valid.map((entry) => entry.value);
if (!ana || !agency) throw new Error("the vendored contract needs two viewer examples");

const EMPTY_RESULT = {
  contract_version: 1,
  request_id: "r",
  fields: [],
  rows: [],
  truncated: false,
  receipt: { job: null, query_id: null, bytes_billed: null, cache_hit: null },
};
const origin = "http://127.0.0.1:3000";

/** A data API that answers /context and every query, and counts the /context calls. */
function dataApi() {
  const fetch = vi.fn(async (url: string) => Response.json(url.endsWith("/context") ? context : EMPTY_RESULT));
  vi.stubGlobal("fetch", fetch);
  return { contextCalls: () => fetch.mock.calls.filter(([url]) => String(url).endsWith("/context")).length };
}

function managedDev() {
  vi.stubEnv("SM_HOSTING", "managed-dev");
  vi.stubEnv("SM_DATA_API_URL", "https://urchin.test/api/app-data/v1");
  vi.stubEnv("SM_DEVELOPER_TOKEN", `smapp_${"e".repeat(43)}`);
  requestHeaders.current = new Headers({ host: "127.0.0.1:3000", origin });
}

describe("a route handler that guards at several layers", () => {
  it("loads the context once for the data dictionary, which guards twice", async () => {
    managedDev();
    const api = dataApi();
    const { GET } = await import("@/app/(app)/data-dictionary/route");
    const response = await GET(new Request(`${origin}/data-dictionary?relation=obt_orders&store=s1`));
    expect(response.status).toBe(200);
    expect(api.contextCalls()).toBe(1);
  });

  it.each([
    ["overview", "@/features/overview/download"],
    ["paid marketing", "@/features/paid-marketing/download"],
    ["performance", "@/features/performance/download"],
  ])("loads the context once for the %s export, which guards at every layer", async (_name, module) => {
    managedDev();
    const api = dataApi();
    const { GET } = (await import(module)) as { GET: (request: Request) => Promise<Response> };
    await GET(new Request(`${origin}/export?store=s1`));
    expect(api.contextCalls()).toBe(1);
  });

  it("loads it again for the next request", async () => {
    managedDev();
    const api = dataApi();
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    await requireViewer();
    await requireViewer();
    requestHeaders.current = new Headers({ host: "127.0.0.1:3000", origin });
    await requireViewer();
    expect(api.contextCalls()).toBe(2);
  });
});

describe("a hosted app serving different people", () => {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
  const request = (viewer: unknown) =>
    (requestHeaders.current = new Headers({ host: "acme-weekly.apps.example", [VIEWER_HEADER]: encode(viewer) }));

  it("gives each request its own viewer and context, never the previous one's", async () => {
    vi.stubEnv("SM_HOSTING", "managed");
    vi.stubEnv("SM_DATA_API_URL", "https://urchin.test/api/app-data/v1");
    vi.stubEnv("SM_APP_ID", "0b2c3d4e-0000-4000-8000-000000000001");
    vi.stubEnv("SM_DEPLOYMENT_ID", "0b2c3d4e-0000-4000-8000-000000000d01");
    const api = dataApi();
    const { requireViewer } = await import("@/lib/auth/require-viewer");
    request(ana);
    const first = requireViewer();
    request(agency);
    const second = requireViewer();
    const [a, b] = await Promise.all([first, second]);
    expect(a.viewer).toMatchObject({ kind: "sourcemedium", access: "member", userId: ana.user_id });
    expect(b.viewer).toMatchObject({ kind: "sourcemedium", access: "agency", userId: agency.user_id });
    expect(api.contextCalls()).toBe(2);
  });
});

describe("the shared-password guard", () => {
  const signedIn = () =>
    (requestHeaders.current = new Headers({ authorization: `Basic ${btoa(`viewer:${TEST_PASSWORD}`)}` }));
  const wrongPassword = () =>
    (requestHeaders.current = new Headers({ authorization: `Basic ${btoa("viewer:not-the-password")}` }));

  it("decides once within a request and judges the next request on its own headers", async () => {
    vi.stubEnv("APP_BASIC_AUTH", `viewer:${TEST_PASSWORD}`);
    const { requireViewer } = await import("@/lib/auth/require-viewer");

    signedIn();
    const first = await requireViewer();
    expect(await requireViewer()).toBe(first);
    expect(first.viewer).toEqual({ kind: "shared-password" });

    // An approved request leaves nothing behind for the next one to borrow.
    wrongPassword();
    await expect(requireViewer()).rejects.toThrow("not signed in");
    await expect(requireViewer()).rejects.toThrow("not signed in");
    requestHeaders.current = new Headers();
    await expect(requireViewer()).rejects.toThrow("not signed in");

    // And a denied request does not turn the next approved one away.
    signedIn();
    await expect(requireViewer()).resolves.toMatchObject({ viewer: { kind: "shared-password" } });
  });
});
