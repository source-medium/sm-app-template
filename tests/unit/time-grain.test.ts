import { expect, it } from "vitest";
import { parseTimeGrain, periodRange, periodStart } from "@/lib/time-grain";
import { comparisonDates, comparisonRange } from "@/lib/comparison";

it("uses Monday weeks across year boundaries and calendar months", () => {
  expect(periodStart("2026-01-01", "week")).toBe("2025-12-29");
  expect(periodStart("2026-01-04", "week")).toBe("2025-12-29");
  expect(periodStart("2026-01-05", "week")).toBe("2026-01-05");
  expect(periodStart("2024-02-29", "month")).toBe("2024-02-01");
  expect(parseTimeGrain({ grain: "MONTH); DROP TABLE x" })).toBe("day");
});

it("clips partial buckets to the selected dates, including leap months", () => {
  expect(periodRange("2024-02-01", "month", { from: "2024-02-10", to: "2024-03-02" })).toEqual({
    from: "2024-02-10",
    to: "2024-02-29",
  });
  expect(periodRange("2025-12-29", "week", { from: "2026-01-01", to: "2026-01-02" })).toEqual({
    from: "2026-01-01",
    to: "2026-01-02",
  });
});

it("aligns comparison lines without shifting March or plotting Feb 28 twice", () => {
  const range = { from: "2024-02-28", to: "2024-03-01" };
  expect(comparisonDates(range, { mode: "year", range: comparisonRange(range, "year") })).toEqual([
    "2023-02-28",
    null,
    "2023-03-01",
  ]);
  const nextYear = { from: "2025-02-28", to: "2025-03-01" };
  expect(comparisonDates(nextYear, { mode: "year", range: comparisonRange(nextYear, "year") })).toEqual([
    "2024-02-28",
    "2024-03-01",
  ]);
  expect(comparisonDates(range, { mode: "previous", range: comparisonRange(range, "previous") })).toEqual([
    "2024-02-25",
    "2024-02-26",
    "2024-02-27",
  ]);
  expect(comparisonDates(range, { mode: "off", range: null })).toEqual([null, null, null]);
});
