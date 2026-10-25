import { describe, expect, it } from "vitest";
import {
  addDays,
  datePresets,
  dateRangeIssue,
  datesInRange,
  defaultRange,
  parseDateRange,
  rangeLength,
  rangePreset,
  reportDates,
  withDates,
  withParams,
} from "@/lib/filters";

const TODAY = "2026-10-05";

describe("URL filters", () => {
  it.each([
    [{ from: "2026-09-30", to: "2026-09-01" }, "start date"],
    [{ from: "2026-02-30", to: "2026-03-01" }, "valid start"],
    [{ from: "2026-01-01", to: "2026-09-30" }, "92 days"],
    [{ from: "2026-10-01", to: "2026-10-06" }, "after today"],
    [{ from: "2026-09-01" }, "valid start"],
  ])("explains a rejected supplied range %j", (params, message) => {
    expect(dateRangeIssue(params, TODAY)).toContain(message);
  });
  it("accepts defaults and valid dates without a correction", () => {
    expect(dateRangeIssue({}, TODAY)).toBeNull();
    expect(dateRangeIssue({ from: "2026-09-01", to: "2026-09-30" }, TODAY)).toBeNull();
  });
  it("offers completed calendar periods, including Monday–Sunday weeks", () => {
    const presets = Object.fromEntries(datePresets("2026-10-07").map((p) => [p.label, p.range]));
    expect(presets.Yesterday).toEqual({ from: "2026-10-06", to: "2026-10-06" });
    expect(presets["Last week"]).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(presets["Last month"]).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(presets["Month to date"]).toEqual({ from: "2026-10-01", to: "2026-10-06" });
    expect(presets["Last 28 days"]).toEqual(defaultRange("2026-10-07"));
  });

  it.each([
    ["2024-03-01", "2024-02-01", "2024-02-29"],
    ["2026-01-01", "2025-12-01", "2025-12-31"],
  ])(
    "handles leap years and year rollover on %s; month to date is then the month that just ended",
    (today, from, to) => {
      const presets = datePresets(today);
      expect(presets.find((p) => p.label === "Last month")?.range).toEqual({ from, to });
      expect(presets.find((p) => p.label === "Month to date")?.range).toEqual({ from, to });
      for (const preset of presets) expect(parseDateRange(preset.range, today)).toEqual(preset.range);
    },
  );

  it("uses the prior complete week on Sunday and Monday", () => {
    expect(datePresets("2026-03-08").find((p) => p.label === "Last week")?.range).toEqual({
      from: "2026-02-23",
      to: "2026-03-01",
    });
    expect(datePresets("2026-03-09").find((p) => p.label === "Last week")?.range).toEqual({
      from: "2026-03-02",
      to: "2026-03-08",
    });
  });

  it("defaults to 28 calendar dates ending yesterday", () => {
    expect(defaultRange(TODAY)).toEqual({ from: "2026-09-07", to: "2026-10-04" });
    expect(rangeLength(defaultRange(TODAY))).toBe(28);
  });

  it("keeps a valid range from the URL", () => {
    expect(parseDateRange({ from: "2026-08-01", to: "2026-08-31" }, TODAY)).toEqual({
      from: "2026-08-01",
      to: "2026-08-31",
    });
  });

  it("clamps the end to today, so forward-dated target rows never show", () => {
    expect(parseDateRange({ from: "2026-10-01", to: "2026-12-31" }, TODAY)).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
    });
  });

  it("caps the range at 92 days, keeping the end", () => {
    expect(parseDateRange({ from: "2026-01-01", to: "2026-09-30" }, TODAY)).toEqual({
      from: "2026-07-01",
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
    expect(parseDateRange(params, TODAY)).toEqual(defaultRange(TODAY));
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

it("offers year presets only within a report's explicit bound, and every quarter on detail views", () => {
  expect(datePresets("2026-10-22").some((p) => p.label === "Year to date")).toBe(false);
  const yearly = datePresets("2026-10-22", 366).find((p) => p.label === "Year to date");
  expect(yearly?.range).toEqual({ from: "2026-01-01", to: "2026-10-21" });
  expect(dateRangeIssue(yearly?.range ?? {}, "2026-10-22", 366)).toBeNull();
  for (const today of ["2026-01-01", "2026-04-01", "2026-07-01", "2026-10-01", "2026-12-31", "2024-04-01"]) {
    const labels = datePresets(today).map((p) => p.label);
    expect(labels).toEqual(expect.arrayContaining(["Quarter to date", "Last quarter"]));
  }
});

describe("date presets in the URL", () => {
  it("offer the common ranges, of completed days only", () => {
    expect(Object.fromEntries(datePresets("2026-10-07", 366).map((p) => [p.value, p.range]))).toEqual({
      yesterday: { from: "2026-10-06", to: "2026-10-06" },
      "last-7-days": { from: "2026-09-30", to: "2026-10-06" },
      "last-14-days": { from: "2026-09-23", to: "2026-10-06" },
      "last-28-days": { from: "2026-09-09", to: "2026-10-06" },
      "last-30-days": { from: "2026-09-07", to: "2026-10-06" },
      "last-90-days": { from: "2026-07-09", to: "2026-10-06" },
      "last-365-days": { from: "2025-10-07", to: "2026-10-06" },
      "week-to-date": { from: "2026-10-05", to: "2026-10-06" },
      "last-week": { from: "2026-09-28", to: "2026-10-04" },
      "month-to-date": { from: "2026-10-01", to: "2026-10-06" },
      "last-month": { from: "2026-09-01", to: "2026-09-30" },
      "quarter-to-date": { from: "2026-10-01", to: "2026-10-06" },
      "last-quarter": { from: "2026-07-01", to: "2026-09-30" },
      "year-to-date": { from: "2026-01-01", to: "2026-10-06" },
      "last-year": { from: "2025-01-01", to: "2025-12-31" },
    });
  });

  it("run to date through yesterday, so a period's first day shows the whole period that just ended", () => {
    const on = (today: string) => Object.fromEntries(datePresets(today, 366).map((p) => [p.value, p.range]));
    expect(on("2026-10-05")["week-to-date"]).toEqual({ from: "2026-09-28", to: "2026-10-04" });
    expect(on("2026-11-01")["month-to-date"]).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(on("2026-10-01")["quarter-to-date"]).toEqual({ from: "2026-07-01", to: "2026-09-30" });
    expect(on("2027-01-01")["year-to-date"]).toEqual({ from: "2026-01-01", to: "2026-12-31" });
  });

  it("resolve against each day's date, so a bookmark keeps rolling", () => {
    const params = { range: "last-28-days" };
    expect(parseDateRange(params, "2026-10-07")).toEqual({ from: "2026-09-09", to: "2026-10-06" });
    expect(parseDateRange(params, "2026-10-08")).toEqual({ from: "2026-09-10", to: "2026-10-07" });
  });

  it("are the preset their own dates name, rolling or pinned in a link", () => {
    for (const today of ["2026-10-07", "2026-10-05", "2026-01-01", "2026-11-01", "2024-03-01", "2024-02-29"])
      for (const maxDays of [92, 366])
        for (const preset of datePresets(today, maxDays)) {
          const params = { range: preset.value };
          const range = parseDateRange(params, today, maxDays);
          expect(range).toEqual(preset.range);
          expect(dateRangeIssue(params, today, maxDays)).toBeNull();
          expect(rangePreset(params, range)?.value).toBe(preset.value);
          const pinned = withDates({}, reportDates(params, range, null).fixed);
          expect(rangePreset(pinned, parseDateRange(pinned, today, maxDays))?.value).toBe(preset.value);
        }
  });

  it("yield to explicit dates, which keep the preset only while they are its dates", () => {
    const edited = { range: "last-7-days", from: "2026-09-01", to: "2026-09-30" };
    expect(parseDateRange(edited, TODAY)).toEqual({ from: "2026-09-01", to: "2026-09-30" });
    expect(rangePreset(edited, parseDateRange(edited, TODAY))).toBeUndefined();
    const copied = { range: "last-month", from: "2026-09-01", to: "2026-09-30" };
    expect(rangePreset(copied, parseDateRange(copied, TODAY))?.value).toBe("last-month");
    expect(rangePreset({ from: "2026-09-07", to: "2026-10-04" }, defaultRange(TODAY))).toBeUndefined();
  });

  it("travel rolling in live links and pinned with their preset in fixed links", () => {
    const week = parseDateRange({ range: "last-7-days" }, TODAY);
    expect(reportDates({ range: "last-7-days" }, week, null)).toEqual({
      rolling: true,
      preset: "last-7-days",
      live: { from: null, to: null, range: "last-7-days" },
      fixed: { ...week, range: "last-7-days" },
    });
    const fallback = defaultRange(TODAY);
    // The default keeps links free of dates, and pins as the preset it is.
    expect(reportDates({}, fallback, null)).toEqual({
      rolling: true,
      preset: "last-28-days",
      live: { from: null, to: null, range: null },
      fixed: { ...fallback, range: "last-28-days" },
    });
    const typed = { from: "2026-09-02", to: "2026-09-08" };
    expect(reportDates(typed, typed, null)).toMatchObject({
      rolling: false,
      preset: null,
      live: { ...typed, range: null },
    });
    // A range that needs fixing travels as its suggested dates.
    expect(reportDates({ range: "nope" }, fallback, "Choose")).toMatchObject({
      rolling: false,
      live: { ...fallback, range: null },
    });
    expect(
      withParams("/overview", withDates({ store: "a", range: "last-7-days" }, { ...typed, range: null }), {}),
    ).toBe("/overview?store=a&from=2026-09-02&to=2026-09-08");
  });

  it("explain a preset the app does not offer or the report cannot hold", () => {
    expect(dateRangeIssue({ range: "last-fortnight" }, TODAY)).toBe("Choose one of the offered date ranges.");
    expect(dateRangeIssue({ range: "" }, TODAY)).toBe("Choose one of the offered date ranges.");
    expect(parseDateRange({ range: "last-fortnight" }, TODAY)).toEqual(defaultRange(TODAY));
    expect(dateRangeIssue({ range: "year-to-date" }, TODAY)).toContain("92 days");
    expect(rangeLength(parseDateRange({ range: "year-to-date" }, TODAY))).toBe(92);
  });
});
