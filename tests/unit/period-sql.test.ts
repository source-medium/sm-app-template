import { describe, expect, expectTypeOf, it } from "vitest";
import { PERIOD_COVERAGE, periodColumns, periodFields, periodParams, periodSql } from "@/lib/data/period-sql";

describe("period SQL", () => {
  const range = { from: "2026-09-01", to: "2026-09-07" };

  it("names row fields exactly as sum() writes its columns", () => {
    const aliases = [
      ...periodSql("date")
        .sum("x", "revenue")
        .matchAll(/ AS (\w+)/g),
    ].map((match) => match[1]);
    expect(periodColumns(["revenue"])).toEqual(aliases);
    expect(periodColumns(["spend"], "total_")).toEqual(["total_spend", "total_previous_spend", "total_second_spend"]);
    const fields = periodFields(["revenue", "orders"], "decoder");
    expect(Object.keys(fields)).toEqual(periodColumns(["revenue", "orders"]));
    expectTypeOf(fields).toEqualTypeOf<
      Record<"revenue" | "previous_revenue" | "second_revenue" | "orders" | "previous_orders" | "second_orders", string>
    >();
  });

  it("binds all three periods, with valid placeholders for the comparisons that are off", () => {
    expect(
      periodParams(range, { from: "2026-08-25", to: "2026-08-31" }, { from: "2025-09-01", to: "2025-09-07" }),
    ).toEqual([
      { name: "start_date", type: "DATE", value: "2026-09-01" },
      { name: "end_date", type: "DATE", value: "2026-09-07" },
      { name: "compare", type: "BOOL", value: true },
      { name: "baseline_from", type: "DATE", value: "2026-08-25" },
      { name: "baseline_to", type: "DATE", value: "2026-08-31" },
      { name: "compare_b", type: "BOOL", value: true },
      { name: "second_from", type: "DATE", value: "2025-09-01" },
      { name: "second_to", type: "DATE", value: "2025-09-07" },
    ]);
    const off = periodParams(range, null);
    expect(off).toContainEqual({ name: "compare", type: "BOOL", value: false });
    expect(off).toContainEqual({ name: "compare_b", type: "BOOL", value: false });
    expect(off).toContainEqual({ name: "baseline_from", type: "DATE", value: "2026-09-01" });
    expect(off).toContainEqual({ name: "second_from", type: "DATE", value: "2026-09-01" });
  });

  it("gates each comparison period's fragments on its own flag and never spans the gap between windows", () => {
    const period = periodSql("date");
    expect(period.rows).toBe(
      "((date BETWEEN @start_date AND @end_date) OR (@compare AND date BETWEEN @baseline_from AND @baseline_to) OR (@compare_b AND date BETWEEN @second_from AND @second_to))",
    );
    expect(period.sum("ad_spend", "spend")).toMatch(
      /AS spend,\s+SUM\(IF\(@compare AND date BETWEEN .*\) AS previous_spend,\s+SUM\(IF\(@compare_b AND date BETWEEN @second_from AND @second_to, ad_spend, NULL\)\) AS second_spend$/,
    );
    expect(period.latest).toContain("MAX(IF(@compare AND date BETWEEN @baseline_from AND @baseline_to, date, NULL))");
    expect(period.latest).toContain("MAX(IF(@compare_b AND date BETWEEN @second_from AND @second_to, date, NULL))");
    // The coverage columns the grouping adds are replaced by the overall dates coverageIssue() reads.
    for (const column of ["group_latest_date", "group_previous_latest_date", "group_second_latest_date"])
      expect(period.latest).toContain(column);
    expect(PERIOD_COVERAGE).toMatch(
      /EXCEPT \(group_latest_date, group_previous_latest_date, group_second_latest_date\)/,
    );
    expect(PERIOD_COVERAGE).toMatch(/AS latest_date,[\s\S]*AS previous_latest_date,[\s\S]*AS second_latest_date$/);
    expect(period.rows).not.toMatch(/BETWEEN @second_from AND @end_date|BETWEEN @baseline_from AND @end_date/);
  });

  it("uses one half-open datetime window per period for a partition filter and the date sums", () => {
    const period = periodSql("DATE(order_processed_at_local_datetime)");
    expect(period.dateTimeRows("order_processed_at_local_datetime")).toBe(
      "((order_processed_at_local_datetime >= DATETIME(@start_date) AND order_processed_at_local_datetime < DATETIME(DATE_ADD(@end_date, INTERVAL 1 DAY))) OR (@compare AND order_processed_at_local_datetime >= DATETIME(@baseline_from) AND order_processed_at_local_datetime < DATETIME(DATE_ADD(@baseline_to, INTERVAL 1 DAY))) OR (@compare_b AND order_processed_at_local_datetime >= DATETIME(@second_from) AND order_processed_at_local_datetime < DATETIME(DATE_ADD(@second_to, INTERVAL 1 DAY))))",
    );
    expect(period.sum("order_line_net_revenue", "revenue")).toContain(
      "DATE(order_processed_at_local_datetime) BETWEEN @start_date AND @end_date",
    );
    expect(period.rows).toContain("DATE(order_processed_at_local_datetime) BETWEEN @start_date AND @end_date");
  });
});
