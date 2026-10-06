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
