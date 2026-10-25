import { describe, expect, it, vi } from "vitest";
import { appConfig } from "@/app.config";
import { csvExport, csvResponse, scopeColumns, type ExportScope } from "@/lib/csv.server";
import { googleError } from "../fake-bigquery/fake-bigquery";
import { goLive, isStoreList, rowsResponse, withStores } from "../helpers/live";

describe("CSV downloads", () => {
  it("preserves exact decimals, bigint, nulls, Unicode, quotes, and line breaks", async () => {
    const response = csvResponse(
      "report.csv",
      [
        { header: "Name", value: () => 'Crème, "A"\nB' },
        { header: "Money", value: () => "-123456789012345678.123456789", numeric: true },
        { header: "Count", value: () => 9007199254740993n, numeric: true },
        { header: "Missing", value: () => null },
      ],
      [{}],
    );
    expect(await response.text()).toBe(
      '"Name","Money","Count","Missing"\r\n"Crème, ""A""\nB","-123456789012345678.123456789","9007199254740993",""\r\n',
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toBe('attachment; filename="report.csv"');
  });

  it("neutralizes spreadsheet formulas in text, including whitespace prefixes", async () => {
    const values = [
      "=1+1",
      "+1+1",
      "-1+1",
      "@SUM(A1)",
      " \t=1+1",
      "\n=1+1",
      "\t123",
      "＝1+1",
      "＋1",
      "－1",
      "＠SUM(A1)",
    ];
    const response = csvResponse("report.csv", [{ header: "Text", value: (value: string) => value }], values);
    expect(await response.text()).toBe(`"Text"\r\n${values.map((v) => `"'${v}"`).join("\r\n")}\r\n`);
  });

  it("rejects formula payloads and nonfinite values declared numeric", () => {
    for (const value of ["=1+1", "-1+1", Infinity, NaN, "1e999"]) {
      expect(() => csvResponse("report.csv", [{ header: "n", value: () => value, numeric: true }], [{}])).toThrow(
        /numeric/,
      );
    }
    expect(() => csvResponse('report.csv"\r\nx-test: bad', [], [])).toThrow(/filename/);
  });
});

describe("CSV export scope", () => {
  const ok = async () => new Response("ok");

  it("starts every export with its mode, optional report, store, dates and currency, in that order", async () => {
    const scope: ExportScope = {
      params: {},
      storeId: "store-a",
      range: { from: "2026-09-01", to: "2026-09-02" },
      mode: "live",
      currency: null,
      timeZone: "UTC",
    };
    const header = async (report?: string) =>
      (await csvResponse("scope.csv", scopeColumns(scope, report), [{}]).text()).split("\r\n").slice(0, 2);
    expect(await header()).toEqual([
      '"data_mode","store_id","from","to","reporting_currency"',
      '"live","store-a","2026-09-01","2026-09-02",""',
    ]);
    expect((await header("geography"))[0]).toBe('"data_mode","report","store_id","from","to","reporting_currency"');
  });

  it("exports the store metadata currency without configuration", async () => {
    await goLive({ submit: withStores(() => rowsResponse([], []), ["csv-metadata-currency"], "UTC", "EUR") });
    const build = vi.fn(ok);
    await csvExport(
      new Request("https://example.test/x/export?store=csv-metadata-currency&from=2026-09-01&to=2026-09-02"),
      build,
    );
    expect(build).toHaveBeenCalledWith(expect.objectContaining({ currency: "EUR" }));
  });

  it("retains an explicit currency override in exports", async () => {
    const original = appConfig.reportingCurrencies;
    appConfig.reportingCurrencies = { "csv-report-currency": "CAD" };
    try {
      await goLive({ submit: withStores(() => rowsResponse([], []), ["csv-report-currency"], "UTC", "EUR") });
      const build = vi.fn(ok);
      await csvExport(
        new Request("https://example.test/x/export?store=csv-report-currency&from=2026-09-01&to=2026-09-02"),
        build,
      );
      expect(build).toHaveBeenCalledWith(expect.objectContaining({ currency: "CAD" }));
    } finally {
      appConfig.reportingCurrencies = original;
    }
  });

  it.each([
    ["from=bad&to=2026-09-02", "valid start"],
    ["from=2026-09-02&to=2026-09-01", "start date"],
    ["from=2026-01-01&to=2026-09-30", "90 days"],
    ["from=2026-09-01", "valid start"],
  ])("rejects %s instead of exporting a different period", async (query, message) => {
    const fake = await goLive({ submit: withStores(() => rowsResponse([], []), ["s1"]) });
    const build = vi.fn(ok);
    const response = await csvExport(new Request(`https://example.test/x/export?store=s1&${query}`), build);
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toMatchObject({
      title: "Check the date range",
      remedy: expect.stringContaining(message),
    });
    expect(build).not.toHaveBeenCalled();
    // At most the store list, for the store's time zone; never a report query.
    expect(fake.calls.filter((call) => call.kind === "submit" && !isStoreList(call))).toHaveLength(0);
  });

  it("ends the range at the store's today, not UTC's", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    // 02:00 UTC on 10 October is 22:00 on 9 October in New York.
    vi.setSystemTime(new Date("2026-10-10T02:00:00Z"));
    try {
      await goLive({ submit: withStores(() => rowsResponse([], []), ["s-new-york"], "America/New_York") });
      const build = vi.fn(ok);
      const tomorrow = await csvExport(
        new Request("https://example.test/x/export?store=s-new-york&from=2026-10-09&to=2026-10-10"),
        build,
      );
      expect(tomorrow.status).toBe(400);
      expect(await tomorrow.json()).toMatchObject({ remedy: "The end date cannot be after today." });
      await csvExport(new Request("https://example.test/x/export?store=s-new-york"), build);
      expect(build).toHaveBeenCalledWith(
        expect.objectContaining({ storeId: "s-new-york", range: { from: "2026-09-11", to: "2026-10-08" } }),
      );
    } finally {
      vi.useRealTimers();
    }
  });

  it("says why it cannot export a store's report, as the page does", async () => {
    const build = vi.fn(ok);
    const reply = async (url: string) => {
      const response = await csvExport(new Request(`https://example.test/x/export${url}`), build);
      return { status: response.status, body: await response.json() };
    };
    await goLive({ submit: withStores(() => rowsResponse([], []), []) });
    expect(await reply("")).toEqual({ status: 400, body: { title: "No store selected" } });
    await goLive({ submit: withStores(() => rowsResponse([], []), ["s-listed"]) });
    expect(await reply("?store=s-unlisted")).toEqual({
      status: 400,
      body: { title: "This store is not in the store list" },
    });
    await goLive({ submit: withStores(() => rowsResponse([], []), ["s-no-zone"], null) });
    expect(await reply("?store=s-no-zone")).toMatchObject({
      status: 503,
      body: { title: "This store's time zone is not published" },
    });
    await goLive({ submit: () => googleError(403, "accessDenied") });
    expect(await reply("")).toMatchObject({ status: 503, body: { title: "The app cannot read this data" } });
    expect(build).not.toHaveBeenCalled();
  });

  it("passes the applied store and range, and refuses another store when one is fixed", async () => {
    await goLive({ submit: withStores(() => rowsResponse([], []), ["s1"]) });
    const build = vi.fn(ok);
    await csvExport(new Request("https://example.test/x/export?store=s1&from=2026-09-01&to=2026-09-02"), build);
    expect(build).toHaveBeenCalledWith(
      expect.objectContaining({ storeId: "s1", range: { from: "2026-09-01", to: "2026-09-02" }, mode: "live" }),
    );

    vi.stubEnv("APP_STORE_ID", "allowed");
    const denied = await csvExport(new Request("https://example.test/x/export?store=s1"), build);
    expect(denied.status).toBe(403);
    expect(build).toHaveBeenCalledTimes(1);
  });
});
