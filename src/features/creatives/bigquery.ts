/**
 * Creatives, live. Each read groups rpt_ad_performance_daily to one row per
 * ad platform and creative over the selected and comparison periods in one
 * pass (period-sql.ts), then either ranks those creatives (the leaderboard)
 * or totals them by scope, format and launch week (the summary), so a total
 * is never computed from the truncated list. Sort columns come from a fixed
 * map in code; the browser only picks the key. The `channel` parameter and
 * alias carry the ad platform (AD_PLATFORM_SQL).
 */
import { ASSET_RELATION, ASSET_PAGE_SIZE, AssetRow, type AssetScope } from "./assets";
import "server-only";
import { rangeLength, type ReportFilters } from "@/lib/filters";
import type { BaselineRanges } from "@/lib/comparison";
import { requireViewer } from "@/lib/auth/require-viewer";
import { adNamePredicate } from "@/lib/data/ad-name-sql";
import { AD_PLATFORM_SQL } from "@/lib/data/channel-sql";
import type { Warehouse } from "@/lib/data/warehouse.server";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { z } from "zod";
import { bq, decodeRows } from "@/lib/data/decode";
import { PERIOD_COVERAGE, PERIOD_PREFIXES, periodParams, periodSql } from "@/lib/data/period-sql";
import { AD_PERIOD_SUMS } from "@/lib/ad-totals";
import { GRAIN_SQL } from "@/lib/time-grain";
import type { Creative, CreativeSummary, CreativesData, CreativesFilters } from "./queries";
import { CREATIVE_FORMATS, type CreativeSort } from "./filters";
import {
  CREATIVE_RELATION,
  CreativeChannelRow,
  CreativeRow,
  CreativeSummaryRow,
  MAX_CREATIVES,
  formatLookbackStart,
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

/** Only HTTPS URLs survive live SQL aggregation, allowing earlier valid links to win over invalid values. */
const httpsUrl = (column: string) => `IF(STARTS_WITH(${column}, 'https://'), ${column}, NULL)`;

/** Normalized creative format; blank or whitespace-only values are treated as missing. */
const FORMAT_SQL = "NULLIF(TRIM(ad_creative_format), '')";

/**
 * The newest of an expression's values, by date with a deterministic
 * tie-breaker on the same day: platform image links are signed and expire,
 * and MAX() would pick by spelling.
 */
const latest = (expression: string) =>
  `ARRAY_AGG(${expression} IGNORE NULLS ORDER BY date DESC, ${expression} DESC LIMIT 1)[SAFE_OFFSET(0)]`;

/**
 * Each creative's first day with spend (from lookbackStart) and latest
 * non-blank format (from formatLookbackStart, the earliest day a comparison can
 * start) on its ad platform, through the selection's end, on any campaign: a
 * creative launches once and keeps one format wherever it runs, independent of
 * comparison periods, so only the store and platform scope this. firstSpend()
 * in rows.ts reads the date.
 */
const launches = (table: string) => `launches AS (
        SELECT ${AD_PLATFORM_SQL} AS channel, ad_creative_id AS creative_id,
          MIN(IF(date >= @lookback_from AND ad_spend > 0, date, NULL)) AS first_date,
          ${latest(FORMAT_SQL)} AS format
        FROM ${table}
        WHERE sm_store_id = @store_id
          AND date BETWEEN @format_from AND @end_date
          AND ad_creative_id IS NOT NULL
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
    { name: "format_from", type: "DATE", value: formatLookbackStart(filters.range) },
    ...periodParams(filters.range, baselines[0], baselines[1]),
  ] as const;
}

/**
 * Inventory reads only enrich the returned ranking. A warehouse without the inventory table,
 * or with an older one, can still serve performance: a failed read is no enrichment. Any
 * other error is a bug and still throws.
 */
async function inventoryEnrichment<T>(read: () => Promise<T>): Promise<T | null> {
  try {
    return await read();
  } catch (error) {
    if (!(error instanceof WarehouseError)) throw error;
    return null;
  }
}

const PREVIEWS_PER_KIND = 8;
/**
 * The ranked creatives' current inventory: up to PREVIEWS_PER_KIND images and videos per
 * creative, the platforms and creatives the inventory covers, and each ranked image at
 * display size, found by store, ad platform and original URL. Previews and ranked images
 * show asset_display_image_url (SourceMedium's smaller copy of a Meta library image, else
 * the image itself). It is one read, so a failure cannot leave a card's original image
 * beside its own display copy in the previews. Without the inventory table, its column or
 * a match, a card shows the original.
 */
async function creativeInventory(
  warehouse: Warehouse,
  storeId: string,
  rows: { channel: string; creative_id: string; image_url: string | null }[],
) {
  if (!rows.length) return null;
  const images = new Map<string, [string, string]>();
  for (const { channel, image_url } of rows)
    if (image_url?.startsWith("https://")) images.set(JSON.stringify([channel, image_url]), [channel, image_url]);
  return inventoryEnrichment(async () => {
    const result = await warehouse.query({
      name: "creative_asset_coverage",
      cache: CACHE_POLICY.aggregate,
      maxRows: rows.length * (2 * PREVIEWS_PER_KIND + 2) + images.size,
      sql: `WITH requested AS (
          SELECT JSON_VALUE(pair, '$[0]') AS channel, JSON_VALUE(pair, '$[1]') AS creative_id
          FROM UNNEST(JSON_QUERY_ARRAY(@identities)) pair
        ), images AS (
          SELECT JSON_VALUE(pair, '$[0]') AS channel, JSON_VALUE(pair, '$[1]') AS image_url
          FROM UNNEST(JSON_QUERY_ARRAY(@images)) pair
        ), candidates AS (
          -- Previews show each image at display size: SourceMedium's smaller copy where it keeps one, else the image.
          SELECT ${AD_PLATFORM_SQL} AS channel, requested.creative_id, asset_position,
            IF(requested.creative_id IS NULL, NULL, CASE
              WHEN STARTS_WITH(asset_video_url, 'https://') THEN 'video'
              WHEN asset_role IN ('image','logo','video') AND STARTS_WITH(asset_image_url,'https://') THEN 'image'
            END) AS kind, asset_display_image_url AS asset_image_url, asset_video_url
          FROM ${warehouse.table(ASSET_RELATION)}
          LEFT JOIN requested ON requested.channel = ${AD_PLATFORM_SQL} AND requested.creative_id = ad_creative_id
          WHERE sm_store_id = @store_id AND ${AD_PLATFORM_SQL} IN (SELECT channel FROM requested)
        ), distinct_media AS (
          SELECT channel, creative_id, kind,
            CASE kind WHEN 'video' THEN asset_video_url WHEN 'image' THEN asset_image_url END AS src,
            MIN(IF(kind = 'video' AND STARTS_WITH(asset_image_url,'https://'), asset_image_url, NULL)) AS poster,
            MIN(asset_position) AS position
          FROM candidates GROUP BY channel, creative_id, kind, src
        ), previews AS (
          SELECT channel, creative_id, kind, src, poster, position FROM distinct_media
          QUALIFY ROW_NUMBER() OVER (PARTITION BY channel, creative_id, kind ORDER BY position, src) <= ${PREVIEWS_PER_KIND}
        ), displays AS (
          -- The inventory repeats an image across ads and creatives: one copy per ranked image.
          SELECT images.channel, images.image_url,
            MIN(IF(STARTS_WITH(asset_display_image_url, 'https://'), asset_display_image_url, NULL)) AS display_url
          FROM ${warehouse.table(ASSET_RELATION)}
          JOIN images ON images.channel = ${AD_PLATFORM_SQL} AND images.image_url = asset_image_url
          WHERE sm_store_id = @store_id
          GROUP BY images.channel, images.image_url
        )
        SELECT channel, creative_id, kind, src, poster, CAST(NULL AS STRING) AS image_url, position FROM previews
        UNION ALL
        -- A ranked image's display copy, in src, beside its original: no creative, kind or poster.
        SELECT channel, NULL, NULL, display_url, NULL, image_url, NULL FROM displays
        ORDER BY channel, creative_id, kind DESC, position, src`,
      params: [
        { name: "store_id", type: "STRING", value: storeId },
        { name: "identities", type: "STRING", value: JSON.stringify(rows.map((r) => [r.channel, r.creative_id])) },
        { name: "images", type: "STRING", value: JSON.stringify([...images.values()]) },
      ],
    });
    const hits = decodeRows(
      z.object({
        channel: bq.string(),
        creative_id: bq.string().nullable(),
        kind: z.enum(["image", "video"]).nullable(),
        src: AssetRow.shape.asset_image_url,
        poster: AssetRow.shape.asset_image_url,
        image_url: bq.string().nullable(),
      }),
      result.rows,
      ASSET_RELATION,
    );
    const coverage = hits.filter((hit) => hit.image_url === null);
    const previews = new Map<string, Creative["media"]>();
    for (const hit of coverage) {
      if (!hit.creative_id || !hit.kind || !hit.src) continue;
      const key = JSON.stringify([hit.channel, hit.creative_id]);
      const items = previews.get(key) ?? [];
      items.push(
        hit.kind === "video" ? { kind: "video", src: hit.src, poster: hit.poster } : { kind: "image", src: hit.src },
      );
      previews.set(key, items);
    }
    const displays = new Map<string, string>();
    for (const hit of hits)
      if (hit.image_url && hit.src) displays.set(JSON.stringify([hit.channel, hit.image_url]), hit.src);
    return {
      previews,
      displays,
      platforms: new Set(coverage.map((r) => r.channel)),
      creatives: new Set(coverage.map((r) => JSON.stringify([r.channel, r.creative_id]))),
    };
  });
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
          -- The original image; creativeInventory() finds its display-size copy after ranking.
          ${latest(httpsUrl("ad_creative_image_url"))} AS image_url,
          ${latest(httpsUrl("ad_creative_thumbnail_url"))} AS thumbnail_url,
          ${latest(httpsUrl("ad_creative_video_url"))} AS video_url,
          ${latest(httpsUrl("ad_creative_post_url"))} AS post_url,
          ${latest(`COALESCE(${httpsUrl("ad_creative_facebook_url")}, ${httpsUrl("ad_creative_instagram_url")})`)} AS ad_url,
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
  const assets = await creativeInventory(warehouse, filters.storeId, rows);
  const first = rows[0];
  return {
    creatives: rows.map((row) =>
      toCreative(
        { ...row, image_url: assets?.displays.get(JSON.stringify([row.channel, row.image_url])) ?? row.image_url },
        filters.range,
        !assets
          ? "unknown"
          : assets.creatives.has(JSON.stringify([row.channel, row.creative_id]))
            ? "available"
            : assets.platforms.has(row.channel)
              ? "no_match"
              : "no_platform_inventory",
        assets?.previews.get(JSON.stringify([row.channel, row.creative_id])),
      ),
    ),
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
        ${AD_PERIOD_SUMS},
        ${period.latest}
        FROM ${table}
        WHERE sm_store_id = @store_id
          AND ${scopeRows(names)}
        GROUP BY creative_id, channel
      ), scoped AS (
        -- A launch week only for a creative that launched in the selected dates, as firstSpend() reads it.
        SELECT grouped.*, format, creative_id IS NOT NULL AS has_creative,
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

export async function queryCreativeAssets(filters: AssetScope) {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "creative_assets",
    maxRows: ASSET_PAGE_SIZE,
    partial: true,
    sql: `SELECT sm_ad_creative_asset_key, source_system, ad_creative_id, ad_id, ad_campaign_id, asset_role,
        asset_pinned_position, asset_performance_label, asset_status, asset_id, asset_text, asset_image_url,
        asset_display_image_url, asset_video_url, asset_video_id, asset_link_url
      FROM ${warehouse.table(ASSET_RELATION)}
      WHERE sm_store_id = @store_id AND (@channel = '' OR ${AD_PLATFORM_SQL} = @channel)
        AND (@entity = '' OR ad_creative_id = @entity) AND (@role = '' OR asset_role = @role)
        AND sm_ad_creative_asset_key > @cursor
      ORDER BY sm_ad_creative_asset_key LIMIT @limit`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "channel", type: "STRING", value: filters.channel },
      { name: "entity", type: "STRING", value: filters.entity },
      { name: "role", type: "STRING", value: filters.role },
      { name: "cursor", type: "STRING", value: filters.cursor },
      { name: "limit", type: "INT64", value: ASSET_PAGE_SIZE + 1 },
    ],
  });
  return { rows: decodeRows(AssetRow, result.rows, ASSET_RELATION), truncated: result.truncated };
}
