import { afterEach, describe, expect, it, vi } from "vitest";
import { compactNumber } from "@/components/charts/compact-number";
import {
  calendarDate,
  EMPTY_VALUE,
  formatCount,
  formatDay,
  formatLabel,
  formatMeasure,
  formatPercent,
  formatWallTime,
  isTimeZone,
} from "@/lib/format";

describe("server formatting", () => {
  afterEach(() => {
    vi.doUnmock("@/app.config");
    vi.resetModules();
  });

  it.each([
    ["en-US", "USD", "$1,234.56"],
    ["de-DE", "EUR", "1.234,56\u00a0€"],
    ["en-US", "JPY", "¥1,235"],
    ["en-US", "KWD", "KWD\u00a01,234.560"],
  ])("uses the configured %s/%s money convention", async (locale, currency, expected) => {
    vi.resetModules();
    vi.doMock("@/app.config", () => ({ appConfig: { locale, currency } }));
    const { formatMoney } = await import("@/lib/format");
    expect(formatMoney("1234.56")).toBe(expected);
    expect(formatMoney("-0.0001")).not.toContain("-");
  });

  it("formats exact counts with every digit", () => {
    expect(formatCount(9_007_199_254_740_993n)).toBe("9,007,199,254,740,993");
    expect(formatCount(null)).toBe("—");
  });

  it("shows fractional measures to two places and whole ones without decimals", () => {
    expect(formatMeasure(1234)).toBe("1,234");
    expect(formatMeasure(12.345)).toBe("12.35");
    expect(formatMeasure("9007199254740993.125")).toBe("9,007,199,254,740,993.13");
  });

  it("formats warehouse dates and wall times without shifting them into a time zone", () => {
    expect(formatDay("2026-10-04")).toBe("Oct 4");
    expect(formatWallTime("2026-10-04T23:30:00")).toBe("Oct 4, 2026, 11:30 PM");
  });

  it("formats ratios as percents", () => {
    expect(formatPercent(0.0126)).toBe("1.26%");
    expect(formatPercent(null)).toBe("—");
  });

  it("compacts axis ticks without locale APIs", () => {
    expect([950, 1200, 45_000, 3_400_000, -2500].map(compactNumber)).toEqual(["950", "1.2K", "45K", "3.4M", "-2.5K"]);
  });
});

it("formatLabel turns warehouse codes into readable labels", () => {
  expect(formatLabel("repeat")).toBe("Repeat");
  expect(formatLabel("online_dtc")).toBe("Online dtc");
  expect(formatLabel(" paid ")).toBe("Paid");
  expect(formatLabel("")).toBe(EMPTY_VALUE);
  expect(formatLabel(null)).toBe(EMPTY_VALUE);
});

describe("store dates", () => {
  it("uses the calendar date in the store's time zone, an IANA name or an order offset", () => {
    const usEvening = new Date("2026-10-10T01:30:00Z");
    expect(calendarDate(usEvening, "America/New_York")).toBe("2026-10-09");
    expect(calendarDate(usEvening, "-07:00")).toBe("2026-10-09");
    expect(calendarDate(new Date("2026-10-09T19:00:00Z"), "+05:30")).toBe("2026-10-10");
    expect(calendarDate(new Date("2026-10-09T12:30:00Z"), "Pacific/Auckland")).toBe("2026-10-10");
  });

  it("recognizes zones calendarDate accepts, and rejects masked or unknown values", () => {
    for (const zone of ["America/Los_Angeles", "UTC", "-07:00"]) expect(isTimeZone(zone)).toBe(true);
    for (const zone of ["2d4bbedff8", "Mars/Olympus", ""]) expect(isTimeZone(zone)).toBe(false);
  });
});
