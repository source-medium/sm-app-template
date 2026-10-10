/**
 * Two periods compared in one pass over the same rows: the selected range
 * (@start_date to @end_date) and, when @compare, the comparison period
 * (@baseline_from to @baseline_to). Comparison views select with these
 * fragments and pass periodParams(), so every view measures periods, and their
 * coverage for coverageIssue(), the same way. Each view keeps its own WHERE
 * clause, which can filter a partition column more precisely.
 */
import { bq } from "./decode";
import type { QueryParameter } from "./bigquery-rest.server";
import type { DateRange } from "@/lib/filters";

export function periodParams(range: DateRange, baseline: DateRange | null): QueryParameter[] {
  return [
    { name: "start_date", type: "DATE", value: range.from },
    { name: "end_date", type: "DATE", value: range.to },
    { name: "compare", type: "BOOL", value: baseline !== null },
    { name: "baseline_from", type: "DATE", value: baseline?.from ?? range.from },
    { name: "baseline_to", type: "DATE", value: baseline?.to ?? range.to },
  ];
}

/**
 * Half-open bounds on a DATETIME column. The same instants as
 * `DATE(column) BETWEEN` the period dates, with the column left bare so a
 * partition filter can prune. `column` is a fixed identifier written in the view.
 */
function dateTimeWindow(column: string, from: string, to: string) {
  return `${column} >= DATETIME(${from}) AND ${column} < DATETIME(DATE_ADD(${to}, INTERVAL 1 DAY))`;
}

/** Grouping fragments for `day`, the SQL for each row's calendar date, such as `date`. */
export function periodSql(day: string) {
  const selected = `${day} BETWEEN @start_date AND @end_date`;
  const compared = `@compare AND ${day} BETWEEN @baseline_from AND @baseline_to`;
  return {
    /** Rows in either period, for a WHERE clause; filter a partition column directly where you can. */
    rows: `((${selected}) OR (${compared}))`,
    /**
     * Either period on a DATETIME partition column. Use this in WHERE and keep
     * `DATE(column)` in `sum` and `latest`, so both sides name one window.
     */
    dateTimeRows: (column: string) =>
      `((${dateTimeWindow(column, "@start_date", "@end_date")}) OR (@compare AND ${dateTimeWindow(column, "@baseline_from", "@baseline_to")}))`,
    /** `column` summed in each period, as `name` and `previous_name`. */
    sum: (column: string, name: string) =>
      `SUM(IF(${selected}, ${column}, NULL)) AS ${name},\n        SUM(IF(${compared}, ${column}, NULL)) AS previous_${name}`,
    /** Each group's latest date with rows in each period; select PERIOD_COVERAGE above the grouping. */
    latest: `MAX(IF(${selected}, ${day}, NULL)) AS group_latest_date,\n        MAX(IF(${compared}, ${day}, NULL)) AS group_previous_latest_date`,
  };
}

/** Above the grouping: its columns, plus each period's latest date across all groups. */
export const PERIOD_COVERAGE = `* EXCEPT (group_latest_date, group_previous_latest_date),
      MAX(group_latest_date) OVER () AS latest_date,
      MAX(group_previous_latest_date) OVER () AS previous_latest_date`;

/** Row fields that PERIOD_COVERAGE adds, for coverageIssue(). */
export const periodCoverageFields = {
  latest_date: bq.date().nullable(),
  previous_latest_date: bq.date().nullable(),
};
