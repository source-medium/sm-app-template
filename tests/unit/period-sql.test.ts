import { describe, expect, it } from "vitest";
import { PERIOD_COVERAGE, periodParams, periodSql } from "@/lib/data/period-sql";

describe("period SQL", () => {
  const range = { from: "2026-09-01", to: "2026-09-07" };

  it("binds both periods, and a valid placeholder comparison when there is none", () => {
    expect(periodParams(range, { from: "2026-08-25", to: "2026-08-31" })).toEqual([
      { name: "start_date", type: "DATE", value: "2026-09-01" },
      { name: "end_date", type: "DATE", value: "2026-09-07" },
      { name: "compare", type: "BOOL", value: true },
      { name: "baseline_from", type: "DATE", value: "2026-08-25" },
      { name: "baseline_to", type: "DATE", value: "2026-08-31" },
    ]);
    expect(periodParams(range, null)).toContainEqual({ name: "compare", type: "BOOL", value: false });
    expect(periodParams(range, null)).toContainEqual({ name: "baseline_from", type: "DATE", value: "2026-09-01" });
  });

  it("gates every comparison-period fragment on @compare", () => {
    const period = periodSql("date");
    expect(period.rows).toBe(
      "((date BETWEEN @start_date AND @end_date) OR (@compare AND date BETWEEN @baseline_from AND @baseline_to))",
    );
    expect(period.sum("ad_spend", "spend")).toMatch(
      /AS spend,\s+SUM\(IF\(@compare AND date BETWEEN .*\) AS previous_spend$/,
    );
    expect(period.latest).toContain("MAX(IF(@compare AND date BETWEEN @baseline_from AND @baseline_to, date, NULL))");
    // The coverage columns the grouping adds are replaced by the overall dates coverageIssue() reads.
    for (const column of ["group_latest_date", "group_previous_latest_date"]) expect(period.latest).toContain(column);
    expect(PERIOD_COVERAGE).toMatch(/EXCEPT \(group_latest_date, group_previous_latest_date\)/);
    expect(PERIOD_COVERAGE).toMatch(/AS latest_date,[\s\S]*AS previous_latest_date$/);
  });
});
