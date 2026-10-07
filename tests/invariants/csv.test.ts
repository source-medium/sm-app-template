import { describe, expect, it } from "vitest";
import { csvResponse } from "@/lib/csv.server";

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
