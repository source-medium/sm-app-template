import { describe, expect, it } from "vitest";
import {
  baselineFor,
  comparisonDates,
  coverageIssue,
  parseComparisonPlan,
  rangeIntent,
  slotChanges,
} from "@/lib/comparison";
import { parseDateRange, reportDates, withDates } from "@/lib/filters";

const today = "2026-10-24";

describe("range intent", () => {
  it("classifies the applied range against the store's date, exactly and disjointly", () => {
    expect(rangeIntent({ from: "2026-10-23", to: "2026-10-23" }, today)).toBe("single_day");
    expect(rangeIntent({ from: "2026-09-01", to: "2026-09-30" }, today)).toBe("full_month");
    expect(rangeIntent({ from: "2026-10-01", to: "2026-10-23" }, today)).toBe("month_to_date");
    expect(rangeIntent({ from: "2026-07-01", to: "2026-09-30" }, today)).toBe("full_quarter");
    expect(rangeIntent({ from: "2026-10-01", to: "2026-10-23" }, "2026-10-24")).toBe("month_to_date");
    expect(rangeIntent({ from: "2026-10-01", to: "2026-11-05" }, "2026-11-06")).toBe("quarter_to_date");
    expect(rangeIntent({ from: "2026-09-26", to: "2026-10-23" }, today)).toBe("rolling");
    expect(rangeIntent({ from: "2026-09-01", to: "2026-09-28" }, today)).toBe("custom");
    // A month that ended yesterday is a full month, not month to date.
    expect(rangeIntent({ from: "2026-09-01", to: "2026-09-30" }, "2026-10-01")).toBe("full_month");
    expect(rangeIntent({ from: "2025-01-01", to: "2025-12-31" }, today)).toBe("full_year");
    expect(rangeIntent({ from: "2026-01-01", to: "2026-10-23" }, today)).toBe("year_to_date");
  });
});

describe("baselines by intent", () => {
  it("compares full months with the previous month and last year's month, allowing unequal lengths", () => {
    const march = { from: "2026-03-01", to: "2026-03-31" };
    expect(baselineFor(march, "full_month", "previous")).toMatchObject({
      range: { from: "2026-02-01", to: "2026-02-28" },
      alignment: "calendar",
      label: "previous month",
    });
    expect(baselineFor(march, "full_month", "year")).toMatchObject({
      range: { from: "2025-03-01", to: "2025-03-31" },
      alignment: "calendar",
    });
    expect(baselineFor({ from: "2026-01-01", to: "2026-01-31" }, "full_month", "previous").range).toEqual({
      from: "2025-12-01",
      to: "2025-12-31",
    });
  });

  it("matches month to date day for day, through a shorter previous month's last day", () => {
    expect(baselineFor({ from: "2026-10-01", to: "2026-10-23" }, "month_to_date", "previous")).toMatchObject({
      range: { from: "2026-09-01", to: "2026-09-23" },
      alignment: "calendar",
    });
    expect(baselineFor({ from: "2026-03-01", to: "2026-03-30" }, "month_to_date", "previous")).toMatchObject({
      range: { from: "2026-02-01", to: "2026-02-28" },
      alignment: "calendar",
      note: null,
    });
  });

  it("uses the previous quarter, the preceding days, the same weekday, and 52 weeks earlier", () => {
    expect(baselineFor({ from: "2026-07-01", to: "2026-09-30" }, "full_quarter", "previous")).toMatchObject({
      range: { from: "2026-04-01", to: "2026-06-30" },
      alignment: "calendar",
    });
    expect(baselineFor({ from: "2026-10-01", to: "2026-10-23" }, "quarter_to_date", "previous")).toMatchObject({
      range: { from: "2026-07-01", to: "2026-07-23" },
      alignment: "position",
    });
    expect(baselineFor({ from: "2026-09-26", to: "2026-10-23" }, "rolling", "previous")).toMatchObject({
      range: { from: "2026-08-29", to: "2026-09-25" },
      alignment: "position",
      label: "previous 28 days",
    });
    expect(baselineFor({ from: "2026-10-23", to: "2026-10-23" }, "single_day", "previous")).toMatchObject({
      range: { from: "2026-10-16", to: "2026-10-16" },
      label: "same weekday last week",
    });
    expect(baselineFor({ from: "2026-09-26", to: "2026-10-23" }, "rolling", "weekday")).toMatchObject({
      range: { from: "2025-09-27", to: "2025-10-24" },
      alignment: "position",
      label: "same weekdays 52 weeks earlier",
    });
  });

  it("has no exact last-year date for February 29 and never reaches before year one", () => {
    const leap = baselineFor({ from: "2028-02-29", to: "2028-02-29" }, "single_day", "year");
    expect(leap.range).toBeNull();
    expect(leap.note).toMatch(/February 29/);
    expect(baselineFor({ from: "0001-01-05", to: "0001-01-05" }, "single_day", "year").range).toBeNull();
    expect(baselineFor({ from: "0001-01-01", to: "0001-01-01" }, "single_day", "weekday").range).toBeNull();
    expect(baselineFor({ from: "2026-10-23", to: "2026-10-23" }, "single_day", "off").range).toBeNull();
  });
});

describe("comparison plan", () => {
  const range = { from: "2026-09-26", to: "2026-10-23" };

  it("defaults to previous period and last year, keeps legacy compare values, and turns both off together", () => {
    const plan = parseComparisonPlan({}, range, today);
    expect(plan.slots.map((slot) => slot.mode)).toEqual(["previous", "year"]);
    expect(plan.slots[0].range).toEqual({ from: "2026-08-29", to: "2026-09-25" });
    expect(plan.slots[1].range).toEqual({ from: "2025-09-26", to: "2025-10-23" });
    expect(plan.active).toBe(0);
    expect(parseComparisonPlan({ compare: "year" }, range, today).slots.map((slot) => slot.mode)).toEqual([
      "year",
      "previous",
    ]);
    const off = parseComparisonPlan({ compare: "off", compare2: "year" }, range, today);
    expect(off.slots.map((slot) => slot.range)).toEqual([null, null]);
    expect(off.slots[off.active]).toMatchObject({ mode: "off", range: null });
    expect(parseComparisonPlan({ compare: "injected" }, range, today).slots[0].mode).toBe("previous");
  });

  it("explains a duplicate second slot instead of querying it twice, and picks the active overlay", () => {
    const duplicate = parseComparisonPlan({ compare: "previous", compare2: "previous" }, range, today);
    expect(duplicate.slots[1].range).toBeNull();
    expect(duplicate.slots[1].note).toMatch(/matches the first comparison/);
    expect(parseComparisonPlan({ baseline: "b" }, range, today).active).toBe(1);
    // The active slot must have a range; otherwise the other one shows.
    expect(parseComparisonPlan({ baseline: "b", compare2: "off" }, range, today).active).toBe(0);
    const second = parseComparisonPlan({ baseline: "b" }, range, today);
    expect(second.slots[second.active]).toMatchObject({
      mode: "year",
      alignment: "calendar",
    });
  });
});

describe("coverage by alignment", () => {
  it("allows unequal calendar periods but still requires the selected period's last days", () => {
    const march = { from: "2026-03-01", to: "2026-03-31" };
    const february = { from: "2026-02-01", to: "2026-02-28" };
    expect(coverageIssue(march, february, "2026-03-31", "2026-02-28", "calendar")).toBeNull();
    expect(coverageIssue(march, february, "2026-03-31", "2026-02-28", "position")).toMatch(/differ in length/);
    expect(coverageIssue(march, february, "2026-03-30", "2026-02-28", "calendar")).toMatch(/last 1 day/);
  });

  it("decides each slot independently from its own coverage columns", () => {
    const plan = parseComparisonPlan({}, { from: "2026-09-01", to: "2026-09-30" }, today);
    const [a, b] = slotChanges(plan, {
      latest_date: "2026-09-30",
      previous_latest_date: "2026-08-31",
      second_latest_date: null,
    });
    expect(a).toEqual({ show: true, issue: null });
    // Last year's data has no rows at all: that slot stays hidden without hiding the first.
    expect(b.show).toBe(true);
    // The selected period's last day has not loaded while last year's has: that slot hides its changes.
    const [first, missing] = slotChanges(plan, {
      latest_date: "2026-09-29",
      previous_latest_date: "2026-08-30",
      second_latest_date: "2025-09-30",
    });
    expect(first.show).toBe(true);
    expect(missing.show).toBe(false);
    expect(missing.issue).toMatch(/last 1 day/);
  });
});

describe("comparison dates", () => {
  it("aligns previous calendar months by day of month and leaves days the shorter month lacks as gaps", () => {
    const march = { from: "2026-03-01", to: "2026-03-31" };
    const previous = baselineFor(march, "full_month", "previous");
    const dates = comparisonDates(march, previous);
    expect(dates[0]).toBe("2026-02-01");
    expect(dates[27]).toBe("2026-02-28");
    expect(dates[28]).toBeNull();
    expect(dates[30]).toBeNull();
  });

  it("aligns rolling previous periods by position, last year by calendar date, and 52 weeks by position", () => {
    const range = { from: "2026-09-26", to: "2026-10-23" };
    expect(comparisonDates(range, baselineFor(range, "rolling", "previous"))[0]).toBe("2026-08-29");
    expect(comparisonDates(range, baselineFor(range, "rolling", "year"))[0]).toBe("2025-09-26");
    expect(comparisonDates(range, baselineFor(range, "rolling", "weekday"))[0]).toBe("2025-09-27");
    expect(comparisonDates(range, baselineFor(range, "rolling", "off"))).toEqual(Array(28).fill(null));
  });
});

describe("comparisons follow the date preset", () => {
  const plan = (preset: string, today: string) => {
    const params = { range: preset };
    return parseComparisonPlan(params, parseDateRange(params, today, 366), today);
  };
  const matches = { range: null, note: expect.stringMatching(/matches the first comparison/) };

  it("use the preset's own period when its dates could be another preset's", () => {
    // In a quarter's first month, quarter to date has month-to-date dates.
    expect(plan("quarter-to-date", "2026-10-15")).toMatchObject({
      intent: "quarter_to_date",
      slots: [{ label: "previous quarter to date", range: { from: "2026-07-01", to: "2026-07-14" } }, {}],
    });
    expect(plan("month-to-date", "2026-10-15").slots[0].range).toEqual({ from: "2026-09-01", to: "2026-09-14" });
    // A one-day month to date still compares with the previous month, not the same weekday.
    expect(plan("month-to-date", "2026-10-02")).toMatchObject({
      intent: "month_to_date",
      slots: [{ range: { from: "2026-09-01", to: "2026-09-01" } }, {}],
    });
    // Year to date compares with last year to date, which is also last year: shown once.
    expect(plan("year-to-date", "2026-01-20")).toMatchObject({
      intent: "year_to_date",
      slots: [{ label: "previous year to date", range: { from: "2025-01-01", to: "2025-01-19" } }, matches],
    });
    expect(plan("week-to-date", "2026-10-08")).toMatchObject({
      intent: "week_to_date",
      slots: [{ label: "previous week to date", range: { from: "2026-09-28", to: "2026-09-30" } }, {}],
    });
  });

  it("treat a to-date preset that reached its period's end as the full period", () => {
    expect(plan("month-to-date", "2026-11-01")).toMatchObject({
      intent: "full_month",
      slots: [{ label: "previous month", range: { from: "2026-09-01", to: "2026-09-30" } }, {}],
    });
    expect(plan("year-to-date", "2027-01-01")).toMatchObject({
      intent: "full_year",
      slots: [{ label: "previous year", range: { from: "2025-01-01", to: "2025-12-31" } }, matches],
    });
    expect(plan("last-week", "2026-10-07")).toMatchObject({
      intent: "full_week",
      slots: [{ label: "previous week", range: { from: "2026-09-21", to: "2026-09-27" } }, {}],
    });
    expect(plan("last-quarter", "2026-10-07")).toMatchObject({
      intent: "full_quarter",
      slots: [{ range: { from: "2026-04-01", to: "2026-06-30" } }, {}],
    });
    expect(plan("last-14-days", "2026-10-07")).toMatchObject({
      intent: "rolling",
      slots: [{ label: "previous 14 days" }, {}],
    });
  });

  it("keep the preset's comparison in a link that pins its dates, unlike the same dates typed", () => {
    const live = { range: "quarter-to-date" };
    const range = parseDateRange(live, "2026-10-15");
    const pinned = withDates({}, reportDates(live, range, null).fixed);
    expect(parseComparisonPlan(pinned, parseDateRange(pinned, "2026-12-01"), "2026-12-01").slots[0].range).toEqual({
      from: "2026-07-01",
      to: "2026-07-14",
    });
    expect(parseComparisonPlan({ from: range.from, to: range.to }, range, "2026-10-15").intent).toBe("month_to_date");
  });

  it("line a previous year up by calendar date, leaving February 29 as a gap", () => {
    const leap = { from: "2024-01-01", to: "2024-12-31" };
    const dates = comparisonDates(leap, baselineFor(leap, "full_year", "previous"));
    expect(dates[58]).toBe("2023-02-28");
    expect(dates[59]).toBeNull();
    expect(dates[60]).toBe("2023-03-01");
    expect(dates[365]).toBe("2023-12-31");
  });
});
