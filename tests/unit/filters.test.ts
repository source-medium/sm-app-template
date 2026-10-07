import { describe, expect, it } from "vitest";
import {
  addDays,
  datePresets,
  datesInRange,
  defaultRange,
  parseDateRange,
  rangeLength,
  withParams,
} from "@/lib/filters";

const NOW = new Date("2026-10-05T03:00:00Z");

describe("URL filters", () => {
  it("offers completed calendar periods, including Monday–Sunday weeks", () => {
    const presets = Object.fromEntries(datePresets(new Date("2026-10-07T23:59:00Z")).map((p) => [p.label, p.range]));
    expect(presets.Yesterday).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(presets["Last full week"]).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(presets["Last month"]).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presets["Month to date"]).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(presets["Last 28 days"]).toEqual(defaultRange(new Date("2026-10-07T23:59:00Z")));
  });

  it.each([
    ["2024-03-01", "2024-02-01", "2024-02-29"],
    ["2026-01-01", "2025-12-01", "2025-12-31"],
  ])("handles leap years and year rollover on %s without an empty month-to-date range", (today, from, to) => {
    const presets = datePresets(new Date(`${today}T00:00:00Z`));
    expect(presets.find((p) => p.label === "Last month")?.range).toEqual({ from, to });
    expect(presets.some((p) => p.label === "Month to date")).toBe(false);
    for (const preset of presets)
      expect(parseDateRange(preset.range, new Date(`${today}T00:00:00Z`))).toEqual(preset.range);
  });

  it("uses the prior complete week on Sunday and Monday across DST", () => {
    expect(datePresets(new Date("2026-03-08T23:00:00Z")).find((p) => p.label === "Last full week")?.range).toEqual({
      from: "2026-02-23",
      to: "2026-03-01",
    });
    expect(datePresets(new Date("2026-03-09T00:00:00Z")).find((p) => p.label === "Last full week")?.range).toEqual({
      from: "2026-03-02",
      to: "2026-03-08",
    });
  });

  it("defaults to 28 calendar dates ending yesterday in UTC", () => {
    expect(defaultRange(NOW)).toEqual({ from: "2026-09-07", to: "2026-10-04" });
    expect(rangeLength(defaultRange(NOW))).toBe(28);
  });

  it("keeps a valid range from the URL", () => {
    expect(parseDateRange({ from: "2026-08-01", to: "2026-08-31" }, NOW)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("clamps the end to today, so forward-dated target rows never show", () => {
    expect(parseDateRange({ from: "2026-10-01", to: "2026-12-31" }, NOW)).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
    });
  });

  it("caps the range at 90 days, keeping the end", () => {
    expect(parseDateRange({ from: "2026-01-01", to: "2026-09-30" }, NOW)).toEqual({
      from: "2026-07-03",
      to: "2026-09-30",
    });
  });

  it.each([
    [{}],
    [{ from: "2026-02-30", to: "2026-03-05" }],
    [{ from: "2026-09-10", to: "2026-09-01" }],
    [{ from: "yesterday", to: "today" }],
    [{ from: "0000-01-01", to: "0000-01-02" }],
    [{ from: "2027-01-01", to: "2027-01-05" }],
    [{ from: ["2026-09-01", "x"], to: "2026-09-02'; DROP TABLE" }],
  ])("falls back to the default for %j", (params) => {
    expect(parseDateRange(params, NOW)).toEqual(defaultRange(NOW));
  });

  it("builds links that change some parameters and keep the rest", () => {
    expect(withParams("/orders", { store: "a", cursor: "c1", q: "x y" }, { cursor: null, order: "o1" })).toBe(
      "/orders?store=a&q=x+y&order=o1",
    );
  });

  it("walks calendar dates across month and DST boundaries", () => {
    expect(datesInRange({ from: "2026-10-30", to: "2026-11-02" })).toEqual([
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
      "2026-11-02",
    ]);
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
  });
});
