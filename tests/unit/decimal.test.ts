import { describe, expect, it } from "vitest";
import { decimalToNumber, fromUnits, ratio, sumDecimals, toUnits } from "@/lib/data/decimal";
import { formatMoney, formatMultiple } from "@/lib/format";

describe("NUMERIC money", () => {
  it("adds exactly where floats drift", () => {
    expect(sumDecimals(["0.1", "0.2"])).toBe("0.3");
    expect(sumDecimals(["99999999999999999999.999999999", "0.000000001"])).toBe("100000000000000000000");
    expect(sumDecimals(["-5.5", "2.25"])).toBe("-3.25");
    expect(sumDecimals([null, null])).toBeNull();
    expect(sumDecimals([null, "1.10"])).toBe("1.1");
  });

  it("round-trips nine fractional digits and rejects anything else", () => {
    expect(fromUnits(toUnits("123.456789012"))).toBe("123.456789012");
    expect(() => toUnits("1.0000000001")).toThrow();
    expect(() => toUnits("1e3")).toThrow();
  });

  it("computes ratios only when both sides exist and the denominator is not zero", () => {
    expect(ratio(10, 4)).toBe(2.5);
    expect(ratio(10, 0)).toBeNull();
    expect(ratio(null, 4)).toBeNull();
    expect(decimalToNumber("12.50")).toBe(12.5);
  });

  it("formats money from exact text without float rounding, and multiples", () => {
    expect(formatMoney("1234567890123456789.12")).toBe("1,234,567,890,123,456,789.12");
    expect(formatMoney("0.005")).toBe("0.01");
    expect(formatMoney(68.4)).toBe("68.40");
    expect(formatMoney(null)).toBe("—");
    expect(formatMultiple(3.4249)).toBe("3.42x");
  });
});
