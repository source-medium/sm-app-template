import { expect, it } from "vitest";
import { overviewTrends, trendDays } from "./trends";
import type { OverviewDay } from "./queries";

const day = (
  date: string,
  netRevenue: string | null,
  orders: number | null = 1,
  adSpend: string | null = "0",
): OverviewDay => ({ date, netRevenue, orders, adSpend, sessions: 10n });

it("adds money exactly, preserves signed refunds and credits, and keeps period totals unchanged", () => {
  const days = [
    day("2026-09-01", "9007199254740993.123456789", 1.5, "0.1"),
    day("2026-09-02", "-0.123456789", 2, "-0.01"),
  ];
  const range = { from: "2026-09-01", to: "2026-09-02" };
  expect(trendDays(days, range, "cumulative").get(range.to)).toMatchObject({
    netRevenue: "9007199254740993",
    orders: 3.5,
    adSpend: "0.09",
  });
  expect(trendDays(days, range, "daily").get(range.to)).toMatchObject({
    netRevenue: "-0.123456789",
    orders: 2,
    adSpend: "-0.01",
  });
  expect(days[0]?.netRevenue).toBe("9007199254740993.123456789");
});

it("keeps each missing measure unknown after the gap, while daily values resume", () => {
  const days = [day("2026-09-01", "10"), day("2026-09-02", null, 2, "0"), day("2026-09-03", "30", 3, "3")];
  const range = { from: "2026-09-01", to: "2026-09-03" };
  expect(trendDays(days, range, "cumulative").get(range.to)).toMatchObject({
    netRevenue: null,
    orders: 6,
    adSpend: "3",
  });
  expect(
    trendDays(
      days.filter((row) => row.date !== "2026-09-02"),
      range,
      "cumulative",
    ).get(range.to),
  ).toMatchObject({
    netRevenue: null,
    orders: null,
    adSpend: null,
  });
  expect(trendDays(days, range, "daily").get(range.to)?.netRevenue).toBe("30");
});

it("accumulates the comparison's full calendar before aligning across a leap day", () => {
  const charts = overviewTrends(
    [day("2025-02-28", "10"), day("2025-03-01", "20")],
    { from: "2025-02-28", to: "2025-03-01" },
    "cumulative",
    null,
    {
      period: { mode: "year", range: { from: "2024-02-28", to: "2024-03-01" } },
      days: [day("2024-02-28", "1"), day("2024-02-29", "2"), day("2024-03-01", "3")],
    },
  );
  expect(charts[0]?.data.map((row) => [row.revenue, row.previous_revenue])).toEqual([
    [10, 1],
    [30, 6],
  ]);
  expect(charts[0]?.data[1]?.previous_revenue__display).toContain("Mar 1, 2024");
  expect(charts[0]?.data[1]?.revenue__display).not.toContain("$");
});

it("leaves an unmatched leap day empty without losing the next comparison point", () => {
  const charts = overviewTrends(
    [day("2024-02-28", "10"), day("2024-02-29", "20"), day("2024-03-01", "30")],
    { from: "2024-02-28", to: "2024-03-01" },
    "cumulative",
    "USD",
    {
      period: { mode: "year", range: { from: "2023-02-28", to: "2023-03-01" } },
      days: [day("2023-02-28", "1"), day("2023-03-01", "2")],
    },
  );
  expect(charts[0]?.data.map((row) => row.previous_revenue)).toEqual([1, null, 3]);
  expect(charts[0]?.data[1]?.previous_revenue__display).toBe("No matching calendar day");
  expect(charts[0]?.data[2]?.revenue__display).toBe("$60.00");
});
