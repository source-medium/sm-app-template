import { afterEach, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { loadStores } from "@/lib/data/stores.server";
import { MAX_STORES } from "@/lib/data/store-roster.server";
import { googleError } from "../fake-bigquery/fake-bigquery";
import { goLive, requestHeaders, rowsResponse } from "../helpers/live";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const originalLabels = appConfig.storeLabels;
const fields = ["sm_store_id", "store_name", "brand_name"].map((name) => ({ name, type: "STRING" }));
const firstStore = { sm_store_id: "store-us", store_name: " US store ", brand_name: " First brand " };
const metadata = [firstStore, { sm_store_id: "store-uk", store_name: "UK store", brand_name: "Second brand" }];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  appConfig.storeLabels = originalLabels;
  requestHeaders.current = new Headers();
});

it("loads named stores and brands from the dimension without scanning a fact table", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, metadata) });
  expect(await loadStores()).toEqual([
    { id: "store-us", label: "US store", brand: "First brand" },
    { id: "store-uk", label: "UK store", brand: "Second brand" },
  ]);
  expect(fake.count("submit")).toBe(1);
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string };
  expect(body.query).toContain("`sm-demotenant.sm_transformed_v2.dim_stores`");
  expect(body.query).not.toContain("rpt_executive_summary_daily");
});

it("keeps display overrides and missing names safe, including object-prototype IDs", async () => {
  appConfig.storeLabels = { "store-us": "Custom label" };
  await goLive({
    submit: () =>
      rowsResponse(fields, [
        firstStore,
        { sm_store_id: "constructor", store_name: " ", brand_name: null },
        { sm_store_id: "__proto__", store_name: null, brand_name: " " },
      ]),
  });
  expect(await loadStores()).toEqual([
    { id: "store-us", label: "Custom label", brand: "First brand" },
    { id: "constructor", label: "constructor", brand: null },
    { id: "__proto__", label: "__proto__", brand: null },
  ]);
});

it("only a missing dimension uses the scoped ID-only roster", async () => {
  const fake = await goLive({
    submit: ({ body }) =>
      (body as { query: string }).query.includes(".dim_stores`")
        ? googleError(404, "notFound")
        : rowsResponse(fields, [{ sm_store_id: "store-us", store_name: null, brand_name: null }]),
  });
  vi.stubEnv("APP_STORE_ID", "store-us");
  expect(await loadStores()).toEqual([{ id: "store-us", label: "store-us", brand: null }]);
  const submissions = fake.calls.filter((call) => call.kind === "submit");
  expect(submissions).toHaveLength(2);
  for (const { body } of submissions) {
    expect((body as { query: string }).query).toContain("AND sm_store_id = @store_id");
    expect((body as { queryParameters: unknown[] }).queryParameters).toContainEqual({
      name: "store_id",
      parameterType: { type: "STRING" },
      parameterValue: { value: "store-us" },
    });
  }
});

it.each([
  [403, "accessDenied", "permission_denied"],
  [400, "invalidQuery", "invalid_query"],
])("does not hide %s failures behind an ID-only roster", async (status, reason, kind) => {
  const fake = await goLive({ submit: () => googleError(Number(status), String(reason)) });
  await expect(loadStores()).rejects.toMatchObject({ kind });
  expect(fake.count("submit")).toBe(1);
});

it("an empty active-store dimension stays empty instead of reviving historical stores", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, []) });
  await expect(loadStores()).resolves.toEqual([]);
  expect(fake.count("submit")).toBe(1);
});

it("does not treat a missing job during polling as a missing dimension", async () => {
  const fake = await goLive({
    submit: () => rowsResponse(fields, [], { jobComplete: false }),
    poll: () => googleError(404, "notFound"),
  });
  await expect(loadStores()).rejects.toMatchObject({ kind: "not_found" });
  expect(fake.count("submit")).toBe(1);
});

it.each(["duplicate", "missing-column", "overflow", "truncated"])("refuses a %s roster", async (failure) => {
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        failure === "missing-column" ? fields.slice(0, 1) : fields,
        failure === "duplicate"
          ? [firstStore, firstStore]
          : failure === "overflow"
            ? Array.from({ length: MAX_STORES + 1 }, (_, i) => ({
                sm_store_id: `store-${i}`,
                store_name: null,
                brand_name: null,
              }))
            : metadata,
        failure === "truncated" ? { pageToken: "more-stores" } : {},
      ),
    poll: () =>
      rowsResponse(
        fields,
        Array.from({ length: MAX_STORES + 1 }, (_, i) => ({
          sm_store_id: `more-${i}`,
          store_name: null,
          brand_name: null,
        })),
        { pageToken: "still-more" },
      ),
  });
  await expect(loadStores()).rejects.toMatchObject({
    kind: failure === "duplicate" || failure === "missing-column" ? "incompatible_schema" : "result_too_large",
  });
  expect(fake.count("submit")).toBe(1);
});
