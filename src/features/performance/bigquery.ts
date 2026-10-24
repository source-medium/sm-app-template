import { SALES_CHANNEL_PREDICATE, validSales } from "@/lib/data/channel-sql";
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { bq, decodeRows } from "@/lib/data/decode";
import { z } from "zod";
import type { PerformanceFilters } from "./queries";
import {
  BUSINESS_FIELDS,
  BUSINESS_RELATION,
  BusinessRow,
  performanceRowLimit,
  PLATFORM_FIELDS,
  PLATFORM_RELATION,
  PlatformRow,
} from "./rows";

const GRAINS = { day: "DAY", week: "WEEK(MONDAY)", month: "MONTH" } as const;
function params(filters: PerformanceFilters) {
  return [
    { name: "store_id", type: "STRING" as const, value: filters.storeId },
    { name: "start_date", type: "DATE" as const, value: filters.range.from },
    { name: "end_date", type: "DATE" as const, value: filters.range.to },
    { name: "channel", type: "STRING" as const, value: filters.channel ?? "" },
  ];
}
/** Order measures count the valid sales channels only, as the catalog defines them; spend and sessions every row. */
function businessColumn(alias: keyof typeof BUSINESS_FIELDS): string {
  const field = BUSINESS_FIELDS[alias];
  return alias === "spend" || alias === "sessions" ? field : validSales(field);
}
export async function queryBusiness(filters: PerformanceFilters) {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "performance_business",
    maxRows: performanceRowLimit(filters.range, filters.grain),
    sql: `WITH scoped AS (
      SELECT DATE_TRUNC(date, ${GRAINS[filters.grain]}) AS period_date,
        ${(Object.keys(BUSINESS_FIELDS) as (keyof typeof BUSINESS_FIELDS)[])
          .map((alias) => `${businessColumn(alias)} AS ${alias}`)
          .join(",\n")}
      FROM ${warehouse.table(BUSINESS_RELATION)}
      WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
        AND ${SALES_CHANNEL_PREDICATE}
    ) SELECT period_date, GROUPING(period_date) = 1 AS is_total,
      ${Object.keys(BUSINESS_FIELDS)
        .map((alias) => `SUM(${alias}) AS ${alias}`)
        .join(",\n")}
    FROM scoped GROUP BY GROUPING SETS ((period_date), ())
    ORDER BY is_total, period_date DESC`,
    params: params(filters),
  });
  return decodeRows(BusinessRow, result.rows, BUSINESS_RELATION);
}
export async function queryPlatforms(filters: PerformanceFilters) {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "performance_platforms",
    // Up to 25 platforms plus the combined group, each with period rows and a total.
    maxRows: performanceRowLimit(filters.range, filters.grain) * 26,
    sql: `WITH scoped AS (
      SELECT DATE_TRUNC(date, ${GRAINS[filters.grain]}) AS period_date,
        COALESCE(source_system, '(unknown platform)') AS platform,
        ${Object.entries(PLATFORM_FIELDS)
          .map(([alias, field]) => `${field} AS ${alias}`)
          .join(",\n")}
      FROM ${warehouse.table(PLATFORM_RELATION)}
      WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
        AND ${SALES_CHANNEL_PREDICATE}
    ) SELECT period_date, GROUPING(period_date) = 1 AS is_total,
      platform, GROUPING(platform) = 1 AS combined,
      ${Object.keys(PLATFORM_FIELDS)
        .map((alias) => `SUM(${alias}) AS ${alias}`)
        .join(",\n")}
    FROM scoped GROUP BY GROUPING SETS ((period_date, platform), (period_date), (platform), ())
    ORDER BY combined DESC, platform, is_total, period_date DESC`,
    params: params(filters),
  });
  return decodeRows(PlatformRow, result.rows, PLATFORM_RELATION);
}
export async function queryPerformanceChannels(filters: PerformanceFilters) {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "performance_channels",
    maxRows: 50,
    sql: `SELECT DISTINCT channel FROM (
      SELECT IFNULL(sm_channel, '(none)') AS channel FROM ${warehouse.table(BUSINESS_RELATION)}
      WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
      UNION ALL
      SELECT IFNULL(sm_channel, '(none)') AS channel FROM ${warehouse.table(PLATFORM_RELATION)}
      WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
    ) ORDER BY channel`,
    params: params(filters).filter((p) => p.name !== "channel"),
  });
  return decodeRows(z.object({ channel: bq.string() }), result.rows, "performance_channels").map((row) => row.channel);
}
