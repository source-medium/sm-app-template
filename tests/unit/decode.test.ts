import { describe, expect, it } from "vitest";
import { z } from "zod";
import { bq, decodeRows, toChartNumber } from "@/lib/data/decode";

describe("BigQuery cell decoders", () => {
  it("keeps INT64 exact beyond the safe-integer range", () => {
    expect(bq.int64().parse("9223372036854775807")).toBe(9_223_372_036_854_775_807n);
    expect(bq.int64().safeParse("1.0").success).toBe(false);
  });

  it("requires FLOAT64 to be finite", () => {
    expect(bq.float64().parse("12.5")).toBe(12.5);
    expect(bq.float64().parse("1.0E10")).toBe(1e10);
    for (const bad of ["NaN", "Infinity", "-Infinity", "", "abc"])
      expect(bq.float64().safeParse(bad).success).toBe(false);
  });

  it("keeps DATE as a calendar string and NUMERIC as exact text", () => {
    expect(bq.date().parse("2026-10-04")).toBe("2026-10-04");
    expect(bq.numeric().parse("123456789012345678901234567.123456789")).toBe("123456789012345678901234567.123456789");
  });

  it("keeps TIMESTAMP microseconds exact", () => {
    expect(bq.timestamp().parse("1759600000123456")).toEqual({
      micros: 1_759_600_000_123_456n,
      iso: "2025-10-04T17:46:40.123Z",
    });
  });

  it("charts only exactly representable numbers", () => {
    expect(toChartNumber(42n)).toBe(42);
    expect(toChartNumber(BigInt(Number.MAX_SAFE_INTEGER) + 1n)).toBeNull();
    expect(toChartNumber(Number.NaN)).toBeNull();
  });

  it("names the relation and the first bad column, never the value", () => {
    const schema = z.object({ a: bq.string(), b: bq.int64() });
    expect(() => decodeRows(schema, [{ a: "x", b: "secret-value" }], "rel")).toThrow(/data no longer matches/i);
    try {
      decodeRows(schema, [{ a: "x" }], "rel");
    } catch (error) {
      expect(error).toMatchObject({ relation: "rel", column: "b" });
      expect(String((error as Error).message)).not.toContain("secret-value");
    }
  });
});
