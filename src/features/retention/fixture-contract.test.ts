import { expect, it } from "vitest";
import { cohortMonths, monthIsElapsed, retentionOptions, shiftMonth } from "./filters";
import { decodeRetention } from "./rows";
import { cohortValue, retentionMatrix } from "./matrix";
import { sampleRetention } from "./sample";

const row = {
  channel: "online_dtc",
  cohort_month: "2026-01-01",
  month_age: "0",
  cohort_size: "100",
  customers: "100",
  cumulative_revenue: "1000.123456789",
  cumulative_profit: "200",
};
it("uses complete calendar months, year boundaries, and bounded URL choices", () => {
  const now = new Date("2026-03-01T00:00:00Z");
  expect(retentionOptions({}, now).asOf).toBe("2026-02");
  expect(retentionOptions({ as_of: "2026-03", measure: "invalid" }, now)).toMatchObject({
    asOf: "2026-02",
    metric: "retention",
  });
  expect(retentionOptions({ as_of: "2026-99" }, now).asOf).toBe("2026-02");
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("0002-01", -11)).toBe("0001-02");
  expect(cohortMonths("2026-02")).toHaveLength(12);
  expect(monthIsElapsed("2026-01-01", 1, "2026-02")).toBe(true);
  expect(monthIsElapsed("2026-01-01", 2, "2026-02")).toBe(false);
});
it("distinguishes zero, missing data and immature periods without filling gaps", () => {
  const rows = decodeRetention([row, { ...row, month_age: "1", customers: "0" }]);
  const matrix = retentionMatrix(rows, "online_dtc", "retention", "2026-03");
  const january = matrix.find((item) => item.id === row.cohort_month);
  expect(january?.cells.slice(0, 4)).toMatchObject([
    { display: "100%", state: "value" },
    { display: "0%", state: "value" },
    { display: "No data", state: "missing" },
    { display: "—", state: "immature" },
  ]);
  expect(
    retentionMatrix(rows, "amazon", "retention", "2026-03").find((item) => item.id === row.cohort_month)?.size,
  ).toBe("No data");
});
it("keeps published decimals exact and distinguishes revenue from gross profit per customer", () => {
  const [decoded] = decodeRetention([row]);
  if (!decoded) throw new Error("Missing fixture");
  expect(decoded.cumulative_revenue).toBe("1000.123456789");
  expect(cohortValue(decoded, "revenue")).toBeCloseTo(10.00123456789);
  expect(cohortValue(decoded, "profit")).toBe(2);
  expect(cohortValue({ ...decoded, cohort_size: "0" }, "retention")).toBeNull();
  expect(cohortValue({ ...decoded, customers: null }, "retention")).toBeNull();
});
it("refuses duplicate slices and changing denominators instead of choosing an arbitrary row", () => {
  expect(() => decodeRetention([row, row])).toThrow("The data no longer matches");
  expect(() => decodeRetention([row, { ...row, month_age: "1", cohort_size: "50" }])).toThrow(
    "The data no longer matches",
  );
});
it("has deterministic store-specific sample cohorts, no future months, and a deliberate published gap", () => {
  const filters = { storeId: "sample-store-a", asOf: "2026-09" };
  const rows = sampleRetention(filters);
  expect(rows).toEqual(sampleRetention(filters));
  expect(new Set(rows.map((item) => item.channel))).toEqual(new Set(["online_dtc", "amazon"]));
  expect(rows.every((item) => monthIsElapsed(item.cohort_month, Number(item.month_age), filters.asOf))).toBe(true);
  expect(
    rows.some((item) => item.channel === "online_dtc" && item.cohort_month === "2026-01-01" && item.month_age === 2n),
  ).toBe(false);
  expect(sampleRetention({ ...filters, storeId: "sample-store-b" })[0]?.cohort_size).not.toBe(rows[0]?.cohort_size);
  expect(sampleRetention({ ...filters, storeId: "unknown" })).toEqual([]);
});

it("plots the same values as the matrix, preserving missing and unelapsed ages and separate channels", async () => {
  const { retentionChart } = await import("./chart");
  const rows = decodeRetention([
    row,
    { ...row, month_age: "1", customers: "0", cumulative_profit: "300" },
    { ...row, month_age: "3", customers: "20", cumulative_profit: "500" },
    { ...row, channel: "amazon", customers: "50", cumulative_profit: "1000" },
  ]);
  const chart = retentionChart(rows, "online_dtc", "retention", "2026-09", "earliest");
  const january = chart.series.find((series) => series.label === "Jan 2026");
  if (!january) throw new Error("Missing cohort series");
  expect(chart.series).toHaveLength(6);
  expect(chart.data[0]?.[january.key]).toBe(1);
  expect(chart.data[1]?.[january.key]).toBe(0);
  expect(chart.data[2]?.[january.key]).toBeNull();
  expect(chart.data[2]?.[`${january.key}__display`]).toBe("No data");
  expect(chart.data[3]?.[january.key]).toBe(0.2);
  expect(chart.data[9]?.[january.key]).toBeNull();
  expect(chart.data[9]?.[`${january.key}__display`]).toBe("—");
  const profit = retentionChart(rows, "online_dtc", "profit", "2026-09", "earliest");
  expect(profit.data[1]?.[january.key]).toBe(3);
  const matrix = retentionMatrix(rows, "online_dtc", "profit", "2026-09").find(
    (cohort) => cohort.id === row.cohort_month,
  );
  expect(profit.data[1]?.[`${january.key}__display`]).toBe(matrix?.cells[1]?.display);
  expect(retentionChart(rows, "amazon", "profit", "2026-09", "earliest").data[0]?.[january.key]).toBe(10);
  const recent = retentionChart(rows, "online_dtc", "profit", "2026-09", "recent");
  expect(recent.series.map((series) => series.label)).toEqual([
    "Apr 2026",
    "May 2026",
    "Jun 2026",
    "Jul 2026",
    "Aug 2026",
    "Sep 2026",
  ]);
  expect(recent.data).toHaveLength(6);
  expect(retentionOptions({ cohorts: "invalid" }, new Date("2026-10-07")).curveWindow).toBe("recent");
});
