import { afterEach, expect, it, vi } from "vitest";
import { GET } from "@/app/(app)/data-dictionary/route";
import { setLogEmitter } from "@/lib/data/log";
import { goLive, requestHeaders, rowsResponse } from "../helpers/live";
import { googleError, hang } from "../fake-bigquery/fake-bigquery";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const fields = ["column_name", "data_type", "column_description", "table_description"].map((name) => ({
  name,
  type: "STRING",
}));
const entry = {
  column_name: "amount",
  data_type: "NUMERIC",
  column_description: "Published amount",
  table_description: null,
};
const url = "https://app.test/data-dictionary?store=store-a&relation=obt_orders";

afterEach(() => {
  setLogEmitter(() => undefined);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  requestHeaders.current = new Headers();
});

it("reads only bound, store-scoped dictionary fields through the real guard and REST protocol", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, [entry]) });
  vi.stubEnv("APP_STORE_ID", "store-a");
  const response = await GET(new Request(url));
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  expect(await response.json()).toEqual({
    mode: "live",
    truncated: false,
    fields: [{ name: "amount", type: "NUMERIC", description: "Published amount" }],
  });
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string; queryParameters: unknown[] };
  expect(body.query).toContain("`sm-demotenant.sm_metadata.dim_data_dictionary`");
  expect(body.query).toContain("WHERE sm_store_id = @store_id AND table_name = @relation");
  expect(body.query).not.toContain("obt_orders");
  expect(body.query).not.toContain("column_sample_");
  expect(body.queryParameters).toEqual([
    { name: "store_id", parameterType: { type: "STRING" }, parameterValue: { value: "store-a" } },
    { name: "relation", parameterType: { type: "STRING" }, parameterValue: { value: "obt_orders" } },
    { name: "limit", parameterType: { type: "INT64" }, parameterValue: { value: "501" } },
  ]);
});

it("rejects an unsigned viewer before a warehouse request", async () => {
  const fake = await goLive({});
  requestHeaders.current = new Headers();
  await expect(GET(new Request(url))).rejects.toMatchObject({ name: "ViewerDeniedError" });
  expect(fake.calls).toHaveLength(0);
});

it("refuses a different store even without middleware", async () => {
  const fake = await goLive({});
  vi.stubEnv("APP_STORE_ID", "store-b");
  expect((await GET(new Request(url))).status).toBe(403);
  expect(fake.calls).toHaveLength(0);
});

it.each([
  "store=store-a",
  "relation=obt_orders",
  "store=store-a&relation=x%60%20UNION",
  "store=a&store=b&relation=x",
  "store=a&relation=x&relation=y",
])("rejects ambiguous or malformed input: %s", async (query) => {
  const fake = await goLive({});
  expect((await GET(new Request(`https://app.test/data-dictionary?${query}`))).status).toBe(400);
  expect(fake.calls).toHaveLength(0);
});

it("labels sample schema and does not include example values or query a warehouse", async () => {
  const fetch = vi.fn();
  vi.stubGlobal("fetch", fetch);
  const response = await GET(new Request(url));
  const report = (await response.json()) as { mode: string; fields: Record<string, unknown>[] };
  expect(report.mode).toBe("sample");
  expect(report.fields.length).toBeGreaterThan(0);
  for (const field of report.fields) expect(Object.keys(field)).toEqual(["name", "type", "description"]);
  expect(fetch).not.toHaveBeenCalled();
});

it("flags a bounded list and preserves empty live metadata", async () => {
  await goLive({
    submit: () =>
      rowsResponse(
        fields,
        Array.from({ length: 501 }, (_, index) => ({ ...entry, column_name: `field_${index}` })),
      ),
  });
  const report = (await (await GET(new Request(url))).json()) as { fields: unknown[]; truncated: boolean };
  expect(report.fields).toHaveLength(500);
  expect(report.truncated).toBe(true);
  await goLive({ submit: () => rowsResponse(fields, []) });
  expect(await (await GET(new Request(url))).json()).toEqual({ mode: "live", fields: [], truncated: false });
});

it("returns a safe failure with no sample fallback or provider error text", async () => {
  await goLive({ submit: () => googleError(403, "accessDenied", "PRIVATE_PROVIDER_MESSAGE") });
  const response = await GET(new Request(url));
  expect(response.status).toBe(503);
  const text = await response.text();
  expect(text).toContain("The app cannot read this data");
  expect(text).not.toContain("PRIVATE_PROVIDER_MESSAGE");
  expect(text).not.toContain('"fields"');
});

it("cancels a known metadata job when its caller closes the panel", async () => {
  const controller = new AbortController();
  const fake = await goLive({
    submit: () => rowsResponse(fields, [], { jobComplete: false }),
    poll: (_call, signal) => {
      controller.abort();
      return hang(signal);
    },
  });
  const response = await GET(new Request(url, { signal: controller.signal }));
  expect(response.status).toBe(503);
  expect(fake.count("submit")).toBe(1);
  expect(fake.count("cancel")).toBe(1);
});
