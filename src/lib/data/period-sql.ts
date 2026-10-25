/**
 * Up to three periods compared in one pass over the same rows: the selected
 * range (@start_date to @end_date) and, when @compare / @compare_b, the first
 * and second comparison periods (@baseline_from to @baseline_to, @second_from
 * to @second_to). Comparison views select with these fragments and pass
 * periodParams(), so every view measures periods, and their coverage for
 * coverageIssue(), the same way. Each view keeps its own WHERE clause, which
 * can filter a partition column more precisely; the windows are an OR of
 * bounded ranges, never the span between the earliest and latest date.
 */
import { bq } from "./decode";
import type { QueryParameter } from "./bigquery-rest.server";
import type { DateRange } from "@/lib/filters";

export function periodParams(
  range: DateRange,
  baseline: DateRange | null,
  second: DateRange | null = null,
): QueryParameter[] {
  return [
    { name: "start_date", type: "DATE", value: range.from },
    { name: "end_date", type: "DATE", value: range.to },
    { name: "compare", type: "BOOL", value: baseline !== null },
    { name: "baseline_from", type: "DATE", value: baseline?.from ?? range.from },
    { name: "baseline_to", type: "DATE", value: baseline?.to ?? range.to },
    { name: "compare_b", type: "BOOL", value: second !== null },
    { name: "second_from", type: "DATE", value: second?.from ?? range.from },
    { name: "second_to", type: "DATE", value: second?.to ?? range.to },
  ];
}

/**
 * Half-open bounds on a DATETIME column. The same instants as
 * `DATE(column) BETWEEN` the period dates, with the column left bare so a
 * partition filter can prune. `column` is a fixed identifier written in the view.
 */
export function dateTimeWindow(column: string, from: string, to: string): string {
  return `${column} >= DATETIME(${from}) AND ${column} < DATETIME(DATE_ADD(${to}, INTERVAL 1 DAY))`;
}

/** Grouping fragments for `day`, the SQL for each row's calendar date, such as `date`. */
export function periodSql(day: string) {
  const selected = `${day} BETWEEN @start_date AND @end_date`;
  const compared = `@compare AND ${day} BETWEEN @baseline_from AND @baseline_to`;
  const second = `@compare_b AND ${day} BETWEEN @second_from AND @second_to`;
  return {
    /** The selected-period predicate alone, for a count or sum written by hand. */
    selected,
    /** The first comparison period's predicate, already gated on @compare. */
    compared,
    /** The second comparison period's predicate, already gated on @compare_b. */
    second,
    /** Rows in any period, for a WHERE clause; filter a partition column directly where you can. */
    rows: `((${selected}) OR (${compared}) OR (${second}))`,
    /**
     * Any period on a DATETIME partition column. Use this in WHERE and keep
     * `DATE(column)` in `sum` and `latest`, so both sides name one window.
     */
    dateTimeRows: (column: string) =>
      `((${dateTimeWindow(column, "@start_date", "@end_date")}) OR (@compare AND ${dateTimeWindow(column, "@baseline_from", "@baseline_to")}) OR (@compare_b AND ${dateTimeWindow(column, "@second_from", "@second_to")}))`,
    /** `column` summed in each period, as `name`, `previous_name` and `second_name`. */
    sum: (column: string, name: string) =>
      `SUM(IF(${selected}, ${column}, NULL)) AS ${name},\n        SUM(IF(${compared}, ${column}, NULL)) AS previous_${name},\n        SUM(IF(${second}, ${column}, NULL)) AS second_${name}`,
    /** Each group's latest date with rows in each period; select PERIOD_COVERAGE above the grouping. */
    latest: `MAX(IF(${selected}, ${day}, NULL)) AS group_latest_date,\n        MAX(IF(${compared}, ${day}, NULL)) AS group_previous_latest_date,\n        MAX(IF(${second}, ${day}, NULL)) AS group_second_latest_date`,
  };
}

/** The column `sum()` writes for `name` in a comparison slot: `previous_name` (first) or `second_name` (second). */
export function slotColumn<N extends string>(slot: 0 | 1, name: N): `previous_${N}` | `second_${N}` {
  return slot === 0 ? `previous_${name}` : `second_${name}`;
}

type PeriodColumn<N extends string, P extends string> = `${P}${N}` | `${P}previous_${N}` | `${P}second_${N}`;

/**
 * The columns `sum()` writes for each name, in period order: `name`,
 * `previous_name`, `second_name`. A `prefix` names a derived set, such as a
 * window total's `total_name`, `total_previous_name` and `total_second_name`.
 */
export function periodColumns<const N extends string, const P extends string = "">(
  names: readonly N[],
  prefix: P = "" as P,
): PeriodColumn<N, P>[] {
  return names.flatMap((name) => [`${prefix}${name}`, `${prefix}previous_${name}`, `${prefix}second_${name}`] as const);
}

/** Row fields for `periodColumns()`, each decoded the same way, so a row schema names every period a query sums. */
export function periodFields<const N extends string, D, const P extends string = "">(
  names: readonly N[],
  decoder: D,
  prefix: P = "" as P,
): Record<PeriodColumn<N, P>, D> {
  return Object.fromEntries(periodColumns(names, prefix).map((column) => [column, decoder])) as Record<
    PeriodColumn<N, P>,
    D
  >;
}

/** Above the grouping: its columns, plus each period's latest date across all groups. */
export const PERIOD_COVERAGE = `* EXCEPT (group_latest_date, group_previous_latest_date, group_second_latest_date),
      MAX(group_latest_date) OVER () AS latest_date,
      MAX(group_previous_latest_date) OVER () AS previous_latest_date,
      MAX(group_second_latest_date) OVER () AS second_latest_date`;

/** Row fields that PERIOD_COVERAGE adds, for coverageIssue(). */
export const periodCoverageFields = {
  latest_date: bq.date().nullable(),
  previous_latest_date: bq.date().nullable(),
  second_latest_date: bq.date().nullable(),
};
