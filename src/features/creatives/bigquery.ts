/**
 * Creatives, live: one row per creative over the range. The sort column is
 * chosen from a fixed map in code; the browser only picks the key.
 */
import "server-only";
import type { ReportFilters } from "@/lib/filters";
import { requireViewer } from "@/lib/auth/require-viewer";
import { adNamePredicate } from "@/lib/data/ad-name-sql";
import { decodeRows } from "@/lib/data/decode";
import type { CreativeSort, CreativesData, CreativesFilters } from "./queries";
import { CREATIVE_RELATION, CreativeChannelRow, CreativeRow, MAX_CREATIVES, toCreative } from "./rows";

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

export async function queryCreatives(filters: CreativesFilters): Promise<CreativesData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const names = adNamePredicate(filters.names);
  const result = await warehouse.query({
    name: "creatives",
    partial: !filters.selection,
    maxRows: filters.selection ? 4 : MAX_CREATIVES,
    sql: `
      SELECT
        ad_creative_id AS creative_id,
        MAX(ad_creative_title) AS title,
        MAX(ad_creative_body) AS body,
        -- The most recent URL: platform image links are signed and expire, and MAX() would pick by spelling.
        ARRAY_AGG(ad_creative_image_url IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS image_url,
        ARRAY_AGG(ad_creative_thumbnail_url IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS thumbnail_url,
        ARRAY_AGG(COALESCE(NULLIF(ad_creative_facebook_url, ''), NULLIF(ad_creative_instagram_url, '')) IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS ad_url,
        MAX(ad_creative_call_to_action_type) AS call_to_action,
        IFNULL(sm_channel, '(none)') AS channel,
        SUM(ad_spend) AS spend,
        SUM(ad_impressions) AS impressions,
        SUM(ad_clicks) AS clicks,
        SUM(ad_platform_reported_conversions) AS conversions,
        SUM(ad_platform_reported_revenue) AS revenue,
        SAFE_DIVIDE(SUM(ad_platform_reported_revenue), SUM(ad_spend)) AS roas,
        SAFE_DIVIDE(SUM(ad_spend), SUM(ad_platform_reported_conversions)) AS cpo,
        SAFE_DIVIDE(SUM(ad_clicks), SUM(ad_impressions)) AS ctr
      FROM ${warehouse.table(CREATIVE_RELATION)}
      WHERE sm_store_id = @store_id
        AND date BETWEEN @start_date AND @end_date
        AND ad_creative_id IS NOT NULL
        AND (@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)
        AND (@campaign = '' OR ad_campaign_id = @campaign)
        AND ${names.sql}
        AND (@selection = '' OR EXISTS (SELECT 1 FROM UNNEST(JSON_QUERY_ARRAY(@selection)) AS selected
          WHERE IFNULL(sm_channel, '(none)') = JSON_VALUE(selected, '$[0]') AND ad_creative_id = JSON_VALUE(selected, '$[1]')))
      GROUP BY creative_id, channel
      HAVING (@minimum_spend = '' OR SUM(ad_spend) >= CAST(NULLIF(@minimum_spend, '') AS NUMERIC))
        AND (@minimum_conversions = '' OR SUM(ad_platform_reported_conversions) >= CAST(NULLIF(@minimum_conversions, '') AS FLOAT64))
      ORDER BY ${ORDER_BY[filters.sort]} NULLS LAST, creative_id, channel
      LIMIT @limit`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      { name: "campaign", type: "STRING", value: filters.campaign ?? "" },
      { name: "limit", type: "INT64", value: filters.selection ? 5 : MAX_CREATIVES + 1 },
      { name: "minimum_spend", type: "STRING", value: filters.minimumSpend ?? "" },
      { name: "minimum_conversions", type: "STRING", value: filters.minimumConversions ?? "" },
      { name: "selection", type: "STRING", value: filters.selection ? JSON.stringify(filters.selection) : "" },
      ...names.params,
    ],
  });
  return {
    creatives: decodeRows(CreativeRow, result.rows, CREATIVE_RELATION).map(toCreative),
    truncated: result.truncated,
  };
}

export async function queryCreativeChannels(filters: ReportFilters): Promise<string[]> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "creative_channels",
    maxRows: 50,
    sql: `SELECT DISTINCT IFNULL(sm_channel, '(none)') AS channel
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
