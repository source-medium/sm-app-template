import { expect, it } from "vitest";
import { formatMetricValue, compactHeadline, formatAttributedConversions } from "@/lib/format";
it("gates optional published units, retains exact decimals, fractional counts and identifiers", () => {
  expect(formatMetricValue("9007199254740993.123456789", "currency", null, "USD")).toBe("$9,007,199,254,740,993.12");
  expect(formatMetricValue("9007199254740993", "count", "currency", null)).toBe("9,007,199,254,740,993");
  expect(formatMetricValue(2.75, "count", "count", null)).toBe("2.75");
  expect(formatMetricValue("000123", "identifier", null, null)).toBe("000123");
  expect(formatMetricValue(null, "currency", "currency", "USD")).not.toBe("$0.00");
  expect(formatMetricValue(0, "currency", "currency", "USD")).toBe("$0.00");
  expect(formatMetricValue(-2.125, "currency", undefined, "USD")).toBe("-$2.13");
});
it("compacts headline display only and preserves small, missing and ratio values", () => {
  expect(compactHeadline("1234567", "$1,234,567.00", "currency", "USD")).toBe("$1.23M");
  expect(compactHeadline(null, "—", "currency", "USD")).toBe("—");
  expect(compactHeadline(12.5, "12.50×", "ratio", null)).toBe("12.50×");
});

it("does not round fractional platform credit into a false zero", () => {
  expect(formatAttributedConversions(0.00125)).toBe("0.00125");
  expect(formatAttributedConversions(0.0000001)).toBe("<0.000001");
  expect(formatAttributedConversions(0)).toBe("0");
});
