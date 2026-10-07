/**
 * Creatives, live: one row per creative over the range. The sort column is
 * chosen from a fixed map in code; the browser only picks the key.
 */
import "server-only";
import type { ReportFilters } from "@/lib/filters";
import { WarehouseError } from "@/lib/data/warehouse-error";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import type { CreativeSort, CreativesData, CreativesFilters } from "./queries";
import { CREATIVE_RELATION, CreativeChannelRow, CreativeRow, MAX_CREATIVES, toCreative } from "./rows";

const ORDER_BY: Record<CreativeSort, string> = {
  spend: "spend DESC",
  impressions: "impressions DESC",
  clicks: "clicks DESC",
  conversions: "conversions DESC",
  ctr: "ctr DESC",
};

export async function queryCreatives(filters: CreativesFilters): Promise<CreativesData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const result = await warehouse.query({
    name: "creatives",
    maxRows: MAX_CREATIVES,
    sql: `
      SELECT
        ad_creative_id AS creative_id,
        MAX(ad_creative_title) AS title,
        MAX(ad_creative_body) AS body,
        -- The most recent URL: platform image links are signed and expire, and MAX() would pick by spelling.
        ARRAY_AGG(ad_creative_image_url IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS image_url,
        ARRAY_AGG(ad_creative_thumbnail_url IGNORE NULLS ORDER BY date DESC LIMIT 1)[SAFE_OFFSET(0)] AS thumbnail_url,
        MAX(ad_creative_call_to_action_type) AS call_to_action,
        IFNULL(sm_channel, '(none)') AS channel,
        SUM(ad_spend) AS spend,
        SUM(ad_impressions) AS impressions,
        SUM(ad_clicks) AS clicks,
        SUM(ad_platform_reported_conversions) AS conversions,
        SAFE_DIVIDE(SUM(ad_clicks), SUM(ad_impressions)) AS ctr
      FROM ${warehouse.table(CREATIVE_RELATION)}
      WHERE sm_store_id = @store_id
        AND date BETWEEN @start_date AND @end_date
        AND ad_creative_id IS NOT NULL
        AND (@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)
      GROUP BY creative_id, channel
      ORDER BY ${ORDER_BY[filters.sort]} NULLS LAST, creative_id, channel
      LIMIT @limit`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      { name: "limit", type: "INT64", value: MAX_CREATIVES + 1 },
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
  if (result.truncated) throw new WarehouseError("result_too_large", { reason: "creative_channels" });
  return decodeRows(CreativeChannelRow, result.rows, CREATIVE_RELATION).map((row) => row.channel);
}
