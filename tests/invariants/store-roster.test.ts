import { afterEach, describe, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { StoreAccessError } from "@/lib/auth/store-access";
import { loadStores, resolveReportStore } from "@/lib/data/stores.server";
import { MAX_STORES } from "@/lib/data/store-roster.server";
import { setLogEmitter } from "@/lib/data/log";
import { googleError } from "../fake-bigquery/fake-bigquery";
import { goLive, ROSTER_FIELDS, rowsResponse, storeRow } from "../helpers/live";

const originalLabels = appConfig.storeLabels;
const originalCurrency = appConfig.currency;
const originalReportingCurrencies = appConfig.reportingCurrencies;
const offset = [{ name: "offset_minutes", type: "INTEGER" }];
const firstStore = {
  sm_store_id: "store-us",
  store_name: " US store ",
  store_url: "https://us.example.com",
  store_logo_url: " https://cdn.example.com/store.png ",
  brand_name: " First brand ",
  store_timezone: "America/New_York",
};
const metadata = [
  firstStore,
  { sm_store_id: "store-uk", store_name: "UK store", brand_name: "Second brand", store_timezone: "Europe/London" },
];

afterEach(() => {
  setLogEmitter(() => undefined);
  vi.restoreAllMocks();
  appConfig.storeLabels = originalLabels;
  appConfig.currency = originalCurrency;
  appConfig.reportingCurrencies = originalReportingCurrencies;
});

it("loads named stores and brands from the dimension without scanning a fact table", async () => {
  const fake = await goLive({ submit: () => rowsResponse(ROSTER_FIELDS, metadata) });
  expect(await loadStores()).toEqual([
    {
      id: "store-us",
      label: "US store",
      domain: "us.example.com",
      logoUrl: "https://cdn.example.com/store.png",
      brand: "First brand",
      timeZone: "America/New_York",
      currency: null,
    },
    {
      id: "store-uk",
      label: "UK store",
      domain: null,
      logoUrl: null,
      brand: "Second brand",
      timeZone: "Europe/London",
      currency: null,
    },
  ]);
  expect(fake.count("submit")).toBe(1);
  const body = fake.calls.find((call) => call.kind === "submit")?.body as { query: string };
  expect(body.query).toContain("`sm-demotenant.sm_transformed_v2.dim_stores`");
  expect(body.query).toContain("store_currency_code");
  expect(body.query).toContain("store_url");
  expect(body.query).toContain("store_logo_url");
  expect(body.query).not.toContain("rpt_executive_summary_daily");
});

it("keeps display overrides and missing names safe, including object-prototype IDs", async () => {
  appConfig.storeLabels = { "store-us": "Custom label" };
  await goLive({
    submit: () =>
      rowsResponse(ROSTER_FIELDS, [
        firstStore,
        { sm_store_id: "constructor", store_name: " ", brand_name: null, store_timezone: null },
        { sm_store_id: "__proto__", store_name: null, brand_name: " ", store_timezone: "masked-1f3a" },
      ]),
  });
  expect(await loadStores()).toEqual([
    {
      id: "store-us",
      label: "Custom label",
      domain: "us.example.com",
      logoUrl: "https://cdn.example.com/store.png",
      brand: "First brand",
      timeZone: "America/New_York",
      currency: null,
    },
    {
      id: "constructor",
      label: "constructor",
      domain: null,
      logoUrl: null,
      brand: null,
      timeZone: null,
      currency: null,
    },
    { id: "__proto__", label: "__proto__", domain: null, logoUrl: null, brand: null, timeZone: null, currency: null },
  ]);
});

it("uses a domain when the name is missing, and the ID when no usable website is available", async () => {
  const websites: [string | null, string | null][] = [
    [" https://www.Example.com/collections?utm_source=demo#shop ", "example.com"],
    ["shop.example.com/products", "shop.example.com"],
    ["//uk.example.com/", "uk.example.com"],
    ["http://example.co.uk", "example.co.uk"],
    [null, null],
    [" ", null],
    ["not a url", null],
    ["https://", null],
    ["javascript:alert(1)", null],
    ["ftp://example.com", null],
    ["mailto:owner@example.com", null],
    ["https://viewer:password@example.com", null],
  ];
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        ROSTER_FIELDS,
        websites.map(([store_url], i) => ({
          ...storeRow(`store-${i}`),
          store_name: i % 2 === 0 ? null : " ",
          store_url,
        })),
      ),
  });
  expect((await loadStores()).map(({ id, label }) => ({ id, label }))).toEqual(
    websites.map(([, domain], i) => ({ id: `store-${i}`, label: domain ?? `store-${i}` })),
  );
  expect(fake.count("submit")).toBe(1);
});

it("keeps stores available when optional logos are missing, malformed, or unsafe", async () => {
  const logos = [
    null,
    " ",
    "not a URL",
    "http://example.com/logo.png",
    "javascript:alert(1)",
    "data:image/png;base64,abc",
    "https://user:password@example.com/logo.png",
  ];
  await goLive({
    submit: () =>
      rowsResponse(
        ROSTER_FIELDS,
        logos.map((store_logo_url, index) => ({ ...storeRow(`logo-${index}`), store_logo_url })),
      ),
  });
  const stores = await loadStores();
  expect(stores).toHaveLength(logos.length);
  expect(stores.every((store) => store.logoUrl === null)).toBe(true);
});

it("only a missing dimension uses the scoped ID-only roster, and the handled probe does not warn", async () => {
  const logs: { line: string; level: string }[] = [];
  setLogEmitter((line, level) => logs.push({ line, level }));
  const fake = await goLive({
    submit: ({ body }) =>
      (body as { query: string }).query.includes(".dim_stores`")
        ? googleError(404, "notFound")
        : rowsResponse(ROSTER_FIELDS, [storeRow("store-us", null)]),
  });
  vi.stubEnv("APP_STORE_ID", "store-us");
  expect(await loadStores()).toEqual([
    { id: "store-us", label: "store-us", domain: null, logoUrl: null, brand: null, timeZone: null, currency: null },
  ]);
  const queries = logs.filter(({ line }) => line.includes('"event":"bq_query"'));
  expect(queries.map(({ level }) => level)).toEqual(["info", "info"]);
  expect(queries[0]?.line).toContain('"error_kind":"not_found"');
  const submissions = fake.calls.filter((call) => call.kind === "submit");
  expect(submissions).toHaveLength(2);
  for (const { body } of submissions) {
    expect((body as { query: string }).query).toContain("store_currency_code");
    expect((body as { query: string }).query).toContain("store_url");
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
  const fake = await goLive({ submit: () => rowsResponse(ROSTER_FIELDS, []) });
  await expect(loadStores()).resolves.toEqual([]);
  expect(fake.count("submit")).toBe(1);
});

it("does not treat a missing job during polling as a missing dimension", async () => {
  const fake = await goLive({
    submit: () => rowsResponse(ROSTER_FIELDS, [], { jobComplete: false }),
    poll: () => googleError(404, "notFound"),
  });
  await expect(loadStores()).rejects.toMatchObject({ kind: "not_found" });
  expect(fake.count("submit")).toBe(1);
});

it.each(["duplicate", "missing-column", "overflow", "truncated"])("refuses a %s roster", async (failure) => {
  const fake = await goLive({
    submit: () =>
      rowsResponse(
        failure === "missing-column" ? ROSTER_FIELDS.slice(0, 1) : ROSTER_FIELDS,
        failure === "duplicate"
          ? [firstStore, firstStore]
          : failure === "overflow"
            ? Array.from({ length: MAX_STORES + 1 }, (_, i) => storeRow(`store-${i}`, null))
            : metadata,
        failure === "truncated" ? { pageToken: "more-stores" } : {},
      ),
    poll: () =>
      rowsResponse(
        ROSTER_FIELDS,
        Array.from({ length: MAX_STORES + 1 }, (_, i) => storeRow(`more-${i}`, null)),
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
  const roster = (storeId: string, zone: string | null) => [storeRow(storeId, zone)];
  const query = (call: { body: unknown }) => (call.body as { query?: string } | null)?.query;

  it("uses the store's dim_stores time zone, and remembers it", async () => {
    const fake = await goLive({ submit: () => rowsResponse(ROSTER_FIELDS, roster("zone-ny", "America/New_York")) });
    expect(await resolveReportStore("zone-ny")).toMatchObject({ status: "ready", timeZone: "America/New_York" });
    expect(await resolveReportStore("zone-ny")).toMatchObject({ status: "ready", timeZone: "America/New_York" });
    expect(fake.count("submit")).toBe(1);
  });

  it("reads the offset SourceMedium applied to recent orders when dim_stores has no usable zone", async () => {
    const fake = await goLive({
      submit: ({ body }) =>
        (body as { query: string }).query.includes("offset_minutes")
          ? rowsResponse(offset, [{ offset_minutes: "-420" }])
          : rowsResponse(ROSTER_FIELDS, roster("zone-masked", "2d4bbedff8")),
    });
    expect(await resolveReportStore("zone-masked")).toMatchObject({ status: "ready", timeZone: "-07:00" });
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
        return rowsResponse(ROSTER_FIELDS, roster("zone-legacy", null));
      },
    });
    expect(await resolveReportStore("zone-legacy")).toMatchObject({ status: "ready", timeZone: "+05:30" });
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
            : rowsResponse(ROSTER_FIELDS, roster("zone-listed", "Europe/Paris")),
    });
    expect(await resolveReportStore("zone-omitted")).toMatchObject({ status: "ready", timeZone: "-05:00" });
    listFails = true;
    expect(await resolveReportStore("zone-list-failed")).toMatchObject({ status: "ready", timeZone: "-05:00" });
    // Without an offset either, the list's failure is the answer, not a guessed zone.
    orders = [];
    expect(await resolveReportStore("zone-list-failed-no-orders")).toMatchObject({
      status: "no_date",
      error: { kind: "permission_denied" },
    });
    expect(fake.calls.filter((call) => call.kind === "submit")).toHaveLength(6);
  });

  it("remembers a zone for an hour", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const fake = await goLive({ submit: () => rowsResponse(ROSTER_FIELDS, roster("zone-hour", "Asia/Tokyo")) });
      expect(await resolveReportStore("zone-hour")).toMatchObject({ status: "ready", timeZone: "Asia/Tokyo" });
      vi.advanceTimersByTime(59 * 60 * 1000);
      expect(await resolveReportStore("zone-hour")).toMatchObject({ status: "ready", timeZone: "Asia/Tokyo" });
      expect(fake.count("submit")).toBe(1);
      vi.advanceTimersByTime(2 * 60 * 1000);
      expect(await resolveReportStore("zone-hour")).toMatchObject({ status: "ready", timeZone: "Asia/Tokyo" });
      expect(fake.count("submit")).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("leaves dates unresolved without a zone or recent orders, preserving why they are unknown", async () => {
    await goLive({
      submit: ({ body }) =>
        (body as { query: string }).query.includes("offset_minutes")
          ? rowsResponse(offset, [])
          : rowsResponse(ROSTER_FIELDS, roster("zone-none", null)),
    });
    expect(await resolveReportStore("zone-none")).toMatchObject({
      status: "no_date",
      error: { kind: "time_zone_unknown" },
    });
    expect(await resolveReportStore("zone-unlisted")).toEqual({
      status: "no_date",
      storeId: "zone-unlisted",
      error: null,
    });
  });
});

describe("the store a report shows", () => {
  /** A store list, and recent orders for any store, or a failure for either. */
  function warehouse(list: ReturnType<typeof storeRow>[] | "fails", orders: { offset_minutes: string }[] = []) {
    return goLive({
      submit: ({ body }) =>
        (body as { query: string }).query.includes("offset_minutes")
          ? rowsResponse(offset, orders)
          : list === "fails"
            ? googleError(403, "accessDenied")
            : rowsResponse(ROSTER_FIELDS, list),
    });
  }

  it("is the first listed store when the URL names none", async () => {
    await warehouse([storeRow("first-ny", "America/New_York"), storeRow("second-la", "America/Los_Angeles")]);
    expect(await resolveReportStore(undefined)).toMatchObject({
      status: "ready",
      storeId: "first-ny",
      timeZone: "America/New_York",
    });
  });

  it("uses the verified reporting currency even when nominal store metadata differs", async () => {
    const original = appConfig.currency;
    appConfig.currency = "GBP";
    try {
      await warehouse([
        storeRow("eur-store", "Europe/Paris", "eur"),
        storeRow("bad-store", "UTC", "not-money"),
        storeRow("blank-store", "UTC", "  "),
      ]);
      expect(await loadStores()).toEqual([
        {
          id: "eur-store",
          label: "eur-store",
          domain: null,
          logoUrl: null,
          brand: null,
          timeZone: "Europe/Paris",
          currency: "EUR",
        },
        {
          id: "bad-store",
          label: "bad-store",
          domain: null,
          logoUrl: null,
          brand: null,
          timeZone: "UTC",
          currency: null,
        },
        {
          id: "blank-store",
          label: "blank-store",
          domain: null,
          logoUrl: null,
          brand: null,
          timeZone: "UTC",
          currency: null,
        },
      ]);
      expect(await resolveReportStore("eur-store")).toMatchObject({
        status: "ready",
        timeZone: "Europe/Paris",
        currency: "GBP",
      });
      expect(await resolveReportStore("bad-store")).toMatchObject({ currency: "GBP" });
      expect(await resolveReportStore("blank-store")).toMatchObject({ currency: "GBP" });
    } finally {
      appConfig.currency = original;
    }
  });

  it("is the URL's store, reading the store list once", async () => {
    const fake = await warehouse([storeRow("url-ny", "America/New_York"), storeRow("url-la", "America/Los_Angeles")]);
    expect(await resolveReportStore("url-la")).toEqual({
      status: "ready",
      storeId: "url-la",
      timeZone: "America/Los_Angeles",
      currency: null,
    });
    expect(fake.count("submit")).toBe(1);
  });

  it("leaves live money unlabeled until its reporting currency is verified", async () => {
    appConfig.currency = null;
    appConfig.reportingCurrencies = {};
    await warehouse([storeRow("unverified-usd", "UTC", "USD")]);
    expect(await resolveReportStore("unverified-usd")).toMatchObject({ currency: null });
  });

  it("applies per-store overrides, including explicit null, without inheriting prototype keys or caching labels", async () => {
    appConfig.currency = "GBP";
    appConfig.reportingCurrencies = {
      "report-cad": " cad ",
      "report-unknown": null,
      "report-invalid": "not-money",
    };
    await warehouse(
      ["report-cad", "report-unknown", "report-invalid", "constructor"].map((id) => storeRow(id, "UTC", "EUR")),
    );
    expect(await resolveReportStore("report-cad")).toMatchObject({ currency: "CAD" });
    expect(await resolveReportStore("report-unknown")).toMatchObject({ currency: null });
    expect(await resolveReportStore("report-invalid")).toMatchObject({ currency: null });
    expect(await resolveReportStore("constructor")).toMatchObject({ currency: "GBP" });
    appConfig.reportingCurrencies["report-cad"] = "AUD";
    expect(await resolveReportStore("report-cad")).toMatchObject({ currency: "AUD" });
  });

  it("keeps synthetic sample money in USD independently of live reporting settings", async () => {
    appConfig.currency = "GBP";
    appConfig.reportingCurrencies = { "sample-store-a": "EUR" };
    expect(await resolveReportStore("sample-store-a")).toMatchObject({ currency: "USD" });
    expect(await resolveReportStore("sample-store-b")).toMatchObject({ currency: "USD" });
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
    await warehouse([storeRow("dateless", null)]);
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
      currency: null,
    });
  });

  it("refuses a store the deployment does not serve before any query", async () => {
    const fake = await warehouse([storeRow("allowed", "UTC")]);
    vi.stubEnv("APP_STORE_ID", "allowed");
    await expect(resolveReportStore("other")).rejects.toBeInstanceOf(StoreAccessError);
    expect(fake.count("submit")).toBe(0);
    expect(await resolveReportStore(undefined)).toMatchObject({ status: "ready", storeId: "allowed" });
  });
});
