/** Money must keep the same precision and zero handling in Node and the deployed Worker. */
import { describe, expect, it } from "vitest";
import { formatMoney } from "@/lib/format";

describe("money formatting", () => {
  it("keeps large decimal strings exact and rounds only for display", () => {
    expect(formatMoney("123456789012345678.123456789")).toBe("123,456,789,012,345,678.12");
    expect(formatMoney("1.005")).toBe("1.01");
    expect(formatMoney("-1.005")).toBe("-1.01");
    expect(formatMoney("0.009")).toBe("0.01");
  });

  it("does not present rounded zero as negative money or nonfinite ratios as amounts", () => {
    for (const value of [0, -0, "-0", "-0.001", -0.001]) expect(formatMoney(value)).toBe("0.00");
    for (const value of [null, Infinity, -Infinity, NaN]) expect(formatMoney(value)).toBe("—");
  });
});
