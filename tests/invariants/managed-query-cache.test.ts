/** A warm cache must never outlive the current managed viewer's authorization. */
import examples from "../../contracts/managed-app-v1/examples.json";
import { beforeEach, expect, it, vi } from "vitest";
import { requireViewer } from "@/lib/auth/require-viewer";
import { CACHE_POLICY } from "@/lib/data/query-cache";
import { resetQueryCache, setQueryCacheEnabled, setQueryCacheStore } from "@/lib/data/query-cache.server";
import { setLogEmitter, type LogEvent } from "@/lib/data/log";
import { resolveReportStore } from "@/lib/data/stores.server";
import { requestHeaders, ROSTER_FIELDS, storeRow } from "../helpers/live";

vi.unmock("@/lib/request-scope");

const contextExample = examples.context.valid.find((entry) => entry.case === "viewer");
const viewerExample = examples.viewer_header.valid.find((entry) => entry.case === "member");
const denial = examples.error.valid.find((entry) => entry.case === "access_denied");
if (!contextExample || !viewerExample || !denial) throw new Error("managed contract examples missing");
const context = contextExample.value;
const viewer = viewerExample.value;
const query = {
  name: "cached_total",
  sql: "SELECT SUM(order_total_revenue) AS total FROM rpt_executive_summary_daily",
  cache: CACHE_POLICY.aggregate,
};
const lines: LogEvent[] = [];
const nextRequest = (id = crypto.randomUUID()) => {
  requestHeaders.current = new Headers({
    host: "demo.apps.example",
    "x-sm-viewer": btoa(String.fromCharCode(...new TextEncoder().encode(JSON.stringify(viewer))))
      .replace(/=/g, "")
      .replace(/\+/g, "-")
      .replace(/\//g, "_"),
    "x-sm-request-id": id,
  });
  return id;
};

beforeEach(() => {
  for (const [key, value] of Object.entries({
    SM_HOSTING: "managed",
    SM_DATA_API_URL: "https://urchin.test/api/app-data/v1",
    SM_APP_ID: context.app.id,
    SM_DEPLOYMENT_ID: "0b2c3d4e-0000-4000-8000-000000000d01",
  }))
    vi.stubEnv(key, value);
  resetQueryCache();
  setQueryCacheEnabled(true);
  setQueryCacheStore(null);
  lines.length = 0;
  setLogEmitter((line) => lines.push(JSON.parse(line) as LogEvent));
});

it("rechecks managed context on every HTTP request, including warm hits, refusal, sign-out and recovery", async () => {
  let denied = false;
  const fetch = vi.fn(async (url: string | URL | Request) => {
    if (String(url).endsWith("/context"))
      return denied ? Response.json(denial.value, { status: denial.status }) : Response.json(context);
    return Response.json({
      contract_version: 1,
      request_id: crypto.randomUUID(),
      fields: [{ name: "total", type: "NUMERIC", mode: "NULLABLE" }],
      rows: [{ total: "42.00" }],
      truncated: false,
      receipt: { job: null, query_id: null, bytes_billed: null, cache_hit: null },
    });
  });
  vi.stubGlobal("fetch", fetch);
  const firstId = nextRequest();
  const first = await requireViewer({ live: true });
  expect(first.request.id).toBe(firstId);
  expect((await first.warehouse.query(query)).servedFrom).toBe("warehouse");
  const secondId = nextRequest();
  const second = await requireViewer({ live: true });
  expect(second.request.id).toBe(secondId);
  expect((await second.warehouse.query(query)).servedFrom).toBe("app-cache");
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/context"))).toHaveLength(2);
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/query"))).toHaveLength(1);
  expect(lines.find((line) => line.event === "app_cache" && line.app_cache === "hit")?.app_request_id).toBe(secondId);

  // A paused app and a removed membership both reach the app as the contract's ACCESS_DENIED.
  denied = true;
  const refusedId = nextRequest();
  const refused = await requireViewer({ live: true });
  await expect(refused.warehouse.query(query)).rejects.toMatchObject({ kind: "permission_denied" });
  expect(lines.at(-1)).toMatchObject({ event: "managed_context_refused", app_request_id: refusedId });
  nextRequest();
  requestHeaders.current.delete("x-sm-viewer");
  await expect(requireViewer({ live: true })).rejects.toThrow("not signed in");
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/context"))).toHaveLength(3);

  denied = false;
  nextRequest();
  expect((await (await requireViewer({ live: true })).warehouse.query(query)).servedFrom).toBe("app-cache");
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/query"))).toHaveLength(1);
});

it("does not trust malformed correlation headers", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json(context)),
  );
  nextRequest("forged\tvalue");
  expect((await requireViewer({ live: true })).request.id).toMatch(/^[0-9a-f-]{36}$/);
});

it("resolves hosted report currency from dim_stores without a workspace currency field or app override", async () => {
  const fetch = vi.fn(async (url: string | URL | Request) =>
    String(url).endsWith("/context")
      ? Response.json(context)
      : Response.json({
          contract_version: 1,
          request_id: crypto.randomUUID(),
          fields: ROSTER_FIELDS.map((field) => ({ ...field, mode: "NULLABLE" })),
          rows: [storeRow("democo-metadata", "America/New_York", "USD")],
          truncated: false,
          receipt: { job: null, query_id: null, bytes_billed: null, cache_hit: null },
        }),
  );
  vi.stubGlobal("fetch", fetch);
  nextRequest();
  expect(await resolveReportStore("democo-metadata")).toMatchObject({ status: "ready", currency: "USD" });
  expect(fetch.mock.calls.filter(([url]) => String(url).endsWith("/query"))).toHaveLength(1);
});
