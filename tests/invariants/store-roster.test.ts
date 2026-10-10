import { afterEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { StoreAccessError } from "@/lib/auth/store-access";
import { loadStores, resolveReportStore, storeTimeZone } from "@/lib/data/stores.server";
import { MAX_STORES } from "@/lib/data/store-roster.server";
import { setLogEmitter } from "@/lib/data/log";
import { googleError } from "../fake-bigquery/fake-bigquery";
import { goLive, requestHeaders, rowsResponse } from "../helpers/live";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));

const originalLabels = appConfig.storeLabels;
const fields = ["sm_store_id", "store_name", "brand_name", "store_timezone"].map((name) => ({ name, type: "STRING" }));
const firstStore = {
  sm_store_id: "store-us",
  store_name: " US store ",
  brand_name: " First brand ",
  store_timezone: "America/New_York",
};
const metadata = [
  firstStore,
  { sm_store_id: "store-uk", store_name: "UK store", brand_name: "Second brand", store_timezone: "Europe/London" },
];

afterEach(() => {
  setLogEmitter(() => undefined);
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  appConfig.storeLabels = originalLabels;
  requestHeaders.current = new Headers();
});

it("loads named stores and brands from the dimension without scanning a fact table", async () => {
  const fake = await goLive({ submit: () => rowsResponse(fields, metadata) });
  expect(await loadStores()).toEqual([
    { id: "store-us", label: "US store", brand: "First brand", timeZone: "America/New_York" },
    { id: "store-uk", label: "UK store", brand: "Second brand", timeZone: "Europe/London" },
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
        { sm_store_id: "constructor", store_name: " ", brand_name: null, store_timezone: null },
        { sm_store_id: "__proto__", store_name: null, brand_name: " ", store_timezone: "masked-1f3a" },
      ]),
  });
  expect(await loadStores()).toEqual([
    { id: "store-us", label: "Custom label", brand: "First brand", timeZone: "America/New_York" },
    { id: "constructor", label: "constructor", brand: null, timeZone: null },
    { id: "__proto__", label: "__proto__", brand: null, timeZone: null },
  ]);
});

it("only a missing dimension uses the scoped ID-only roster, and the handled probe does not warn", async () => {
  const logs: { line: string; level: string }[] = [];
  setLogEmitter((line, level) => logs.push({ line, level }));
  const fake = await goLive({
    submit: ({ body }) =>
      (body as { query: string }).query.includes(".dim_stores`")
        ? googleError(404, "notFound")
        : rowsResponse(fields, [{ sm_store_id: "store-us", store_name: null, brand_name: null, store_timezone: null }]),
  });
  vi.stubEnv("APP_STORE_ID", "store-us");
  expect(await loadStores()).toEqual([{ id: "store-us", label: "store-us", brand: null, timeZone: null }]);
  const queries = logs.filter(({ line }) => line.includes('"event":"bq_query"'));
  expect(queries.map(({ level }) => level)).toEqual(["info", "info"]);
  expect(queries[0]?.line).toContain('"error_kind":"not_found"');
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
                store_timezone: null,
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
          store_timezone: null,
        })),
        { pageToken: "still-more" },
      ),
  });
  const remedy = expect.stringContaining(`More than ${MAX_STORES} stores`);
  await expect(loadStores()).rejects.toMatchObject(
    failure === "duplicate" || failure === "missing-column"
      ? { kind: "incompatible_schema" }
      : { kind: "result_too_large", remedy, message: remedy },
  );
  expect(fake.count("submit")).toBe(1);
});

describe("store time zones", () => {
  const offset = [{ name: "offset_minutes", type: "INTEGER" }];
  const roster = (storeId: string, zone: string | null) => [
    { sm_store_id: storeId, store_name: null, brand_name: null, store_timezone: zone },
  ];
  const query = (call: { body: unknown }) => (call.body as { query?: string } | null)?.query;

  it("uses the store's dim_stores time zone, and remembers it", async () => {
    const fake = await goLive({ submit: () => rowsResponse(fields, roster("zone-ny", "America/New_York")) });
    expect(await storeTimeZone("zone-ny")).toBe("America/New_York");
    expect(await storeTimeZone("zone-ny")).toBe("America/New_York");
    expect(fake.count("submit")).toBe(1);
  });

  it("reads the offset SourceMedium applied to recent orders when dim_stores has no usable zone", async () => {
    const fake = await goLive({
      submit: ({ body }) =>
        (body as { query: string }).query.includes("offset_minutes")
          ? rowsResponse(offset, [{ offset_minutes: "-420" }])
          : rowsResponse(fields, roster("zone-masked", "2d4bbedff8")),
    });
    expect(await storeTimeZone("zone-masked")).toBe("-07:00");
    const sql = fake.calls.map(query).find((text) => text?.includes("offset_minutes"));
    expect(sql).toContain("sm_store_id = @store_id");
    expect(sql).toContain("STARTS_WITH(LOWER(IFNULL(source_system, '')), 'amazon'), order_processed_at DESC");
  });

  it("reads the order offset where dim_stores is not published", async () => {
    await goLive({
      submit: ({ body }) => {
        const sql = (body as { query: string }).query;
        if (sql.includes(".dim_stores`")) return googleError(404, "notFound");
        if (sql.includes("offset_minutes")) return rowsResponse(offset, [{ offset_minutes: "330" }]);
        return rowsResponse(fields, roster("zone-legacy", null));
      },
    });
    expect(await storeTimeZone("zone-legacy")).toBe("+05:30");
  });

  it("reads the order offset for a store the list omits, or when the list fails", async () => {
    let listFails = false;
    let orders = [{ offset_minutes: "-300" }];
    const fake = await goLive({
      submit: ({ body }) =>
        (body as { query: string }).query.includes("offset_minutes")
          ? rowsResponse(offset, orders)
          : listFails
            ? googleError(403, "accessDenied")
            : rowsResponse(fields, roster("zone-listed", "Europe/Paris")),
    });
    expect(await storeTimeZone("zone-omitted")).toBe("-05:00");
    listFails = true;
    expect(await storeTimeZone("zone-list-failed")).toBe("-05:00");
    // Without an offset either, the list's failure is the answer, not a guessed zone.
    orders = [];
    await expect(storeTimeZone("zone-list-failed-no-orders")).rejects.toMatchObject({ kind: "permission_denied" });
    expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(6);
  });

  it("remembers a zone for an hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const fake = await goLive({ submit: () => rowsResponse(fields, roster("zone-hour", "Asia/Tokyo")) });
      expect(await storeTimeZone("zone-hour")).toBe("Asia/Tokyo");
      vi.advanceTimersByTime(59 * 60 * 1000);
      expect(await storeTimeZone("zone-hour")).toBe("Asia/Tokyo");
      expect(fake.count("submit")).toBe(1);
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(await storeTimeZone("zone-hour")).toBe("Asia/Tokyo");
      expect(fake.count("submit")).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("never guesses: a listed store without a zone or recent orders is an error, an unlisted store is null", async () => {
    await goLive({
      submit: ({ body }) =>
        (body as { query: string }).query.includes("offset_minutes")
          ? rowsResponse(offset, [])
          : rowsResponse(fields, roster("zone-none", null)),
    });
    await expect(storeTimeZone("zone-none")).rejects.toMatchObject({ kind: "time_zone_unknown" });
    await expect(storeTimeZone("zone-unlisted")).resolves.toBeNull();
  });
});

describe("the store a report shows", () => {
  const offset = [{ name: "offset_minutes", type: "INTEGER" }];
  const store = (id: string, zone: string | null) => ({
    sm_store_id: id,
    store_name: null,
    brand_name: null,
    store_timezone: zone,
  });
  /** A store list, and recent orders for any store, or a failure for either. */
  function warehouse(list: ReturnType<typeof store>[] | "fails", orders: { offset_minutes: string }[] = []) {
    return goLive({
      submit: ({ body }) =>
        (body as { query: string }).query.includes("offset_minutes")
          ? rowsResponse(offset, orders)
          : list === "fails"
            ? googleError(403, "accessDenied")
            : rowsResponse(fields, list),
    });
  }

  it("is the first listed store when the URL names none, with the list for the picker", async () => {
    await warehouse([store("first-ny", "America/New_York"), store("second-la", "America/Los_Angeles")]);
    expect(await resolveReportStore(undefined)).toMatchObject({
      status: "ready",
      storeId: "first-ny",
      timeZone: "America/New_York",
      stores: [{ id: "first-ny" }, { id: "second-la" }],
    });
  });

  it("is the URL's store, reading the store list once", async () => {
    const fake = await warehouse([store("url-ny", "America/New_York"), store("url-la", "America/Los_Angeles")]);
    expect(await resolveReportStore("url-la")).toEqual({
      status: "ready",
      storeId: "url-la",
      timeZone: "America/Los_Angeles",
      stores: null,
    });
    expect(fake.count("submit")).toBe(1);
  });

  it("says when there is no store to show, and why", async () => {
    await warehouse([]);
    expect(await resolveReportStore(undefined)).toEqual({ status: "no_store", error: null });
    await warehouse("fails");
    expect(await resolveReportStore(undefined)).toMatchObject({
      status: "no_store",
      error: { kind: "permission_denied" },
    });
  });

  it("says when the store's dates are unknown, and why", async () => {
    await warehouse([store("dateless", null)]);
    expect(await resolveReportStore("not-listed")).toEqual({ status: "no_date", storeId: "not-listed", error: null });
    expect(await resolveReportStore("dateless")).toMatchObject({
      status: "no_date",
      storeId: "dateless",
      error: { kind: "time_zone_unknown" },
    });
  });

  it("still shows a store whose orders give its zone when the list fails", async () => {
    await warehouse("fails", [{ offset_minutes: "-240" }]);
    expect(await resolveReportStore("listless")).toEqual({
      status: "ready",
      storeId: "listless",
      timeZone: "-04:00",
      stores: null,
    });
  });

  it("refuses a store the deployment does not serve before any query", async () => {
    const fake = await warehouse([store("allowed", "UTC")]);
    vi.stubEnv("APP_STORE_ID", "allowed");
    await expect(resolveReportStore("other")).rejects.toBeInstanceOf(StoreAccessError);
    expect(fake.count("submit")).toBe(0);
    expect(await resolveReportStore(undefined)).toMatchObject({ status: "ready", storeId: "allowed" });
  });
});
