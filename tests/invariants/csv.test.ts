import { afterEach, describe, expect, it, vi } from "vitest";
import { csvExport, csvResponse } from "@/lib/csv.server";
import { goLive, isStoreList, requestHeaders, rowsResponse, withStores } from "../helpers/live";

vi.mock("next/headers", () => ({ headers: async () => requestHeaders.current }));
vi.mock("react", async (original) => ({ ...(await original<typeof import("react")>()), cache: <T>(fn: T) => fn }));
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

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
