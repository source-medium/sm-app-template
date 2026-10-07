/** Creatives' live path end to end against the fake BigQuery. */
import { afterEach, describe, expect, it, vi } from "vitest";
import { goLive, requestHeaders, rowsResponse } from "../../../tests/helpers/live";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

const FIELDS = [
  { name: "creative_id", type: "STRING" },
  { name: "title", type: "STRING" },
  { name: "body", type: "STRING" },
  { name: "image_url", type: "STRING" },
  { name: "thumbnail_url", type: "STRING" },
  { name: "call_to_action", type: "STRING" },
  { name: "channel", type: "STRING" },
  { name: "spend", type: "NUMERIC" },
  { name: "impressions", type: "INTEGER" },
  { name: "clicks", type: "INTEGER" },
  { name: "conversions", type: "FLOAT" },
  { name: "ctr", type: "FLOAT" },
];
const ROW = {
  creative_id: "cr1",
  title: "Summer",
  body: null,
  image_url: "javascript:alert(1)",
  thumbnail_url: "https://cdn.example.com/t.jpg",
  call_to_action: "SHOP_NOW",
  channel: "Meta",
  spend: "0.1",
  impressions: "9007199254740993",
  clicks: "2",
  conversions: "0.5",
  ctr: "0.02",
};
const FILTERS = { storeId: "store-1", range: { from: "2026-09-01", to: "2026-09-02" } };

type Submitted = { query: string; queryParameters: { name: string }[] };

describe("creatives, live", () => {
  it("sorts by a column from the fixed map and takes each creative's latest image", async () => {
    const fake = await goLive({ submit: () => rowsResponse(FIELDS, [ROW]) });
    const { getCreatives } = await import("./queries");
    const data = await getCreatives({ ...FILTERS, sort: "ctr" });
    expect(data.creatives[0]).toMatchObject({
      creativeId: "cr1",
      imageUrl: "https://cdn.example.com/t.jpg",
      impressions: 9_007_199_254_740_993n,
    });
    expect(data.truncated).toBe(false);

    const submit = fake.calls.find((call) => call.kind === "submit")?.body as Submitted;
    expect(submit.query).toContain("ORDER BY ctr DESC NULLS LAST, creative_id");
    expect(submit.query).toContain("ARRAY_AGG(ad_creative_image_url IGNORE NULLS ORDER BY date DESC LIMIT 1)");
    expect(submit.queryParameters.map((parameter) => parameter.name)).toEqual([
      "store_id",
      "start_date",
      "end_date",
      "limit",
    ]);
  });

  it("reports more creatives than the grid holds as truncation", async () => {
    await goLive({
      submit: () =>
        rowsResponse(FIELDS, [], {
          pageToken: "more",
          rows: Array.from({ length: 49 }, (_, index) => ({
            f: FIELDS.map((field) => ({
              v: field.name === "creative_id" ? `cr${index}` : field.type === "STRING" ? null : "1",
            })),
          })),
        }),
    });
    const { getCreatives } = await import("./queries");
    const data = await getCreatives({ ...FILTERS, sort: "spend" });
    expect(data.creatives).toHaveLength(48);
    expect(data.truncated).toBe(true);
  });
});

// Exercise direct calls as well as pages: middleware cannot be the store boundary.
it("refuses another store in dispatch and live loaders before any warehouse call", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", "allowed-store");
  const { getCreatives } = await import("./queries");
  const { queryCreatives } = await import("./bigquery");
  await expect(getCreatives({ ...FILTERS, sort: "spend" })).rejects.toThrow("This store is not available");
  await expect(queryCreatives({ ...FILTERS, sort: "spend" })).rejects.toThrow("This store is not available");
  expect(fake.calls).toHaveLength(0);
});

it("allows the fixed store and keeps every SQL read scoped to it", async () => {
  const fake = await goLive({ submit: () => rowsResponse([], []) });
  vi.stubEnv("APP_STORE_ID", FILTERS.storeId);
  const { getCreatives } = await import("./queries");
  await getCreatives({ ...FILTERS, sort: "spend" });
  const queries = fake.calls.filter((call) => call.kind === "submit");
  expect(queries.length).toBeGreaterThan(0);
  for (const call of queries) {
    const body = call.body as { query: string; queryParameters: unknown[] };
    expect(body.query).toContain("sm_store_id = @store_id");
    expect(body.queryParameters).toContainEqual({
      name: "store_id",
      parameterType: { type: "STRING" },
      parameterValue: { value: FILTERS.storeId },
    });
  }
});
