/**
 * Creatives, live. Each read groups rpt_ad_performance_daily to one row per
 * ad platform and creative over the selected and comparison periods in one
 * pass (period-sql.ts), then either ranks those creatives (the leaderboard)
 * or totals them by scope, format and launch week (the summary), so a total
 * is never computed from the truncated list. Sort columns come from a fixed
 * map in code; the browser only picks the key. The `channel` parameter and
 * alias carry the ad platform (AD_PLATFORM_SQL).
 */
import "server-only";
import { rangeLength, type ReportFilters } from "@/lib/filters";
import type { BaselineRanges } from "@/lib/comparison";
import { requireViewer } from "@/lib/auth/require-viewer";
import { adNamePredicate } from "@/lib/data/ad-name-sql";
import { AD_PLATFORM_SQL } from "@/lib/data/channel-sql";
import { decodeRows } from "@/lib/data/decode";
import { PERIOD_COVERAGE, PERIOD_PREFIXES, periodParams, periodSql } from "@/lib/data/period-sql";
import { AD_PERIOD_SUMS } from "@/lib/ad-totals";
import { GRAIN_SQL } from "@/lib/time-grain";
import type { CreativeSummary, CreativesData, CreativesFilters } from "./queries";
import { CREATIVE_FORMATS, type CreativeSort } from "./filters";
import {
  CREATIVE_RELATION,
  CreativeChannelRow,
  CreativeRow,
  CreativeSummaryRow,
  MAX_CREATIVES,
  lookbackStart,
  toCreative,
  toCreativeSummary,
} from "./rows";
import { CACHE_POLICY } from "@/lib/data/query-cache";

const ORDER_BY: Record<CreativeSort, string> = {
  spend: "spend DESC",
  impressions: "impressions DESC",
  clicks: "clicks DESC",
  conversions: "conversions DESC",
  ctr: "ctr DESC",
  revenue: "revenue DESC",
  roas: "roas DESC",
  cpo: "cpo ASC",
};

const period = periodSql("date");

/** Ratios of each period's sums, never an average of daily ratios. */
const PERIOD_RATIOS = PERIOD_PREFIXES.map(
  (prefix) => `SAFE_DIVIDE(${prefix}revenue, ${prefix}spend) AS ${prefix}roas,
      SAFE_DIVIDE(${prefix}spend, ${prefix}conversions) AS ${prefix}cpo,
      SAFE_DIVIDE(${prefix}clicks, ${prefix}impressions) AS ${prefix}ctr`,
).join(",\n      ");

/** The newest of a column's values, by date: platform image links are signed and expire, and MAX() would pick by spelling. */
const latest = (column: string) => `ARRAY_AGG(${column} IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)]`;

/**
 * Each creative's first day with spend on its ad platform, from the lookback
 * before the selection (lookbackStart) through its end, on any campaign: a
 * creative launches once, wherever it runs, so only the store and platform
 * scope this. firstSpend() in rows.ts reads the date.
 */
const launches = (table: string) => `launches AS (
        SELECT ${AD_PLATFORM_SQL} AS channel, ad_creative_id AS creative_id, MIN(date) AS first_date
        FROM ${table}
        WHERE sm_store_id = @store_id AND date BETWEEN @lookback_from AND @end_date
          AND ad_creative_id IS NOT NULL AND ad_spend > 0
          AND (@channel = '' OR ${AD_PLATFORM_SQL} = @channel)
        GROUP BY channel, creative_id
      )`;

/**
 * The delivery both reads group, after the store predicate each read states
 * beside its FROM: rows in each period, with the page's platform, campaign
 * and name filters.
 */
const scopeRows = (names: { sql: string }) => `${period.rows}
          AND (@channel = '' OR ${AD_PLATFORM_SQL} = @channel)
          AND (@campaign = '' OR ad_campaign_id = @campaign)
          AND ${names.sql}`;

function scopeParams(filters: CreativesFilters, baselines: BaselineRanges) {
  return [
    { name: "store_id", type: "STRING", value: filters.storeId },
    { name: "channel", type: "STRING", value: filters.channel ?? "" },
    { name: "campaign", type: "STRING", value: filters.campaign ?? "" },
    { name: "format", type: "STRING", value: filters.format ?? "" },
    { name: "lookback_from", type: "DATE", value: lookbackStart(filters.range.from) },
    ...periodParams(filters.range, baselines[0], baselines[1]),
  ] as const;
}

export async function queryCreatives(filters: CreativesFilters, baselines: BaselineRanges): Promise<CreativesData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const table = warehouse.table(CREATIVE_RELATION);
  const names = adNamePredicate(filters.names);
  const result = await warehouse.query({
    name: "creatives",
    cache: CACHE_POLICY.aggregate,
    partial: !filters.selection,
    maxRows: filters.selection ? 4 : MAX_CREATIVES,
    sql: `
      WITH ${launches(table)}, grouped AS (
        SELECT
          ad_creative_id AS creative_id,
          ${AD_PLATFORM_SQL} AS channel,
          MAX(ad_creative_title) AS title,
          MAX(ad_creative_body) AS body,
          ${latest("ad_creative_name")} AS name,
          ${latest("ad_creative_image_url")} AS image_url,
          ${latest("ad_creative_thumbnail_url")} AS thumbnail_url,
          ${latest("ad_creative_format")} AS format,
          ${latest("NULLIF(ad_creative_post_url, '')")} AS post_url,
          ${latest("COALESCE(NULLIF(ad_creative_facebook_url, ''), NULLIF(ad_creative_instagram_url, ''))")} AS ad_url,
          MAX(ad_creative_call_to_action_type) AS call_to_action,
        ${AD_PERIOD_SUMS},
        ${period.latest}
        FROM ${table}
        WHERE sm_store_id = @store_id
          AND ${scopeRows(names)}
          AND ad_creative_id IS NOT NULL
        GROUP BY creative_id, channel
      ), scoped AS (
        -- Coverage spans every creative in scope, before the list keeps those that ran in the
        -- selected period at the minimums, or the creatives selected to compare.
        SELECT ${PERIOD_COVERAGE},
          ${PERIOD_RATIOS}
        FROM grouped LEFT JOIN launches USING (channel, creative_id)
        WHERE @format = '' OR format = @format
      )
      SELECT * FROM scoped
      WHERE spend IS NOT NULL
        AND (@minimum_spend = '' OR spend >= CAST(NULLIF(@minimum_spend, '') AS NUMERIC))
        AND (@minimum_conversions = '' OR IFNULL(conversions, 0) >= CAST(NULLIF(@minimum_conversions, '') AS FLOAT64))
        AND (@selection = '' OR EXISTS (SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(@selection)) AS selected
          WHERE channel = JSON_VALUE(selected, '$[0]') AND creative_id = JSON_VALUE(selected, '$[1]')))
      ORDER BY ${ORDER_BY[filters.sort]} NULLS LAST, creative_id, channel
      LIMIT @limit`,
    params: [
      ...scopeParams(filters, baselines),
      { name: "limit", type: "INT64", value: filters.selection ? 5 : MAX_CREATIVES + 1 },
      { name: "minimum_spend", type: "STRING", value: filters.minimumSpend ?? "" },
      { name: "minimum_conversions", type: "STRING", value: filters.minimumConversions ?? "" },
      { name: "selection", type: "STRING", value: filters.selection ? JSON.stringify(filters.selection) : "" },
      ...names.params,
    ],
  });
  const rows = decodeRows(CreativeRow, result.rows, CREATIVE_RELATION);
  const first = rows[0];
  return {
    creatives: rows.map((row) => toCreative(row, filters.range)),
    truncated: result.truncated,
    coverage: first
      ? {
          latest_date: first.latest_date,
          previous_latest_date: first.previous_latest_date,
          second_latest_date: first.second_latest_date,
        }
      : null,
  };
}

/**
 * The scope's totals, formats and launch weeks in one pass. Delivery without
 * a creative identity is its own group (has_creative false), so the report can
 * say how much spend the creatives cover. Minimums, sorting and selection
 * shape only the list, never these totals.
 */
export async function queryCreativeSummary(
  filters: CreativesFilters,
  baselines: BaselineRanges,
): Promise<CreativeSummary> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const table = warehouse.table(CREATIVE_RELATION);
  const names = adNamePredicate(filters.names);
  // With and without a creative identity: a total, each format or none, and each launch week the
  // range touches plus those running before it.
  const weeks = Math.ceil(rangeLength(filters.range) / 7) + 2;
  const result = await warehouse.query({
    name: "creative_summary",
    cache: CACHE_POLICY.aggregate,
    maxRows: 2 * (1 + CREATIVE_FORMATS.length + 1 + weeks),
    sql: `
      WITH ${launches(table)}, grouped AS (
        SELECT
          ad_creative_id AS creative_id,
          ${AD_PLATFORM_SQL} AS channel,
          ${latest("ad_creative_format")} AS format,
        ${AD_PERIOD_SUMS},
        ${period.latest}
        FROM ${table}
        WHERE sm_store_id = @store_id
          AND ${scopeRows(names)}
        GROUP BY creative_id, channel
      ), scoped AS (
        -- A launch week only for a creative that launched in the selected dates, as firstSpend() reads it.
        SELECT grouped.*, creative_id IS NOT NULL AS has_creative,
          IF(first_date >= @start_date, DATE_TRUNC(first_date, ${GRAIN_SQL.week}), NULL) AS launch_week
        FROM grouped LEFT JOIN launches USING (channel, creative_id)
        WHERE @format = '' OR format = @format
      )
      SELECT
        CASE WHEN GROUPING(format) = 0 THEN 'format' WHEN GROUPING(launch_week) = 0 THEN 'launch' ELSE 'total' END AS kind,
        has_creative, format, launch_week,
        SUM(spend) AS spend, SUM(previous_spend) AS previous_spend, SUM(second_spend) AS second_spend,
        SUM(impressions) AS impressions, SUM(previous_impressions) AS previous_impressions, SUM(second_impressions) AS second_impressions,
        SUM(clicks) AS clicks, SUM(previous_clicks) AS previous_clicks, SUM(second_clicks) AS second_clicks,
        SUM(conversions) AS conversions, SUM(previous_conversions) AS previous_conversions, SUM(second_conversions) AS second_conversions,
        SUM(revenue) AS revenue, SUM(previous_revenue) AS previous_revenue, SUM(second_revenue) AS second_revenue,
        COUNTIF(spend > 0) AS creatives, COUNTIF(previous_spend > 0) AS previous_creatives, COUNTIF(second_spend > 0) AS second_creatives,
        COUNTIF(launch_week IS NOT NULL AND spend > 0) AS new_creatives,
        MAX(group_latest_date) AS latest_date,
        MAX(group_previous_latest_date) AS previous_latest_date,
        MAX(group_second_latest_date) AS second_latest_date
      FROM scoped
      GROUP BY GROUPING SETS ((has_creative), (has_creative, format), (has_creative, launch_week))
      ORDER BY kind, has_creative DESC, spend DESC NULLS LAST, format, launch_week`,
    params: [...scopeParams(filters, baselines), ...names.params],
  });
  return toCreativeSummary(decodeRows(CreativeSummaryRow, result.rows, CREATIVE_RELATION));
}

export async function queryCreativeChannels(filters: ReportFilters): Promise<string[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "creative_channels",
    cache: CACHE_POLICY.aggregate,
    maxRows: 50,
    sql: `SELECT DISTINCT ${AD_PLATFORM_SQL} AS channel
      FROM ${warehouse.table(CREATIVE_RELATION)}
      WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
        AND ad_creative_id IS NOT NULL
      ORDER BY channel`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
    ],
  });
  return decodeRows(CreativeChannelRow, result.rows, CREATIVE_RELATION).map((row) => row.channel);
}
