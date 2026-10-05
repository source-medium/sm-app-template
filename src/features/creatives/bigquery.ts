/**
 * Creatives, live: one row per creative over the range. The sort column is
 * chosen from a fixed map in code; the browser only picks the key.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import type { CreativeSort, CreativesData, CreativesFilters } from "./queries";
import { CREATIVE_RELATION, CreativeRow, MAX_CREATIVES, toCreative } from "./rows";

const ORDER_BY: Record<CreativeSort, string> = {
  spend: "spend DESC",
  impressions: "impressions DESC",
  clicks: "clicks DESC",
  conversions: "conversions DESC",
  ctr: "ctr DESC",
};

export async function queryCreatives(filters: CreativesFilters): Promise<CreativesData> {
  const { warehouse } = await requireViewer({ live: true });
  const result = await warehouse.query({
    name: "creatives",
    maxRows: MAX_CREATIVES,
    sql: `
      SELECT
        ad_creative_id AS creative_id,
        MAX(ad_creative_title) AS title,
        MAX(ad_creative_body) AS body,
        MAX(ad_creative_image_url) AS image_url,
        MAX(ad_creative_thumbnail_url) AS thumbnail_url,
        MAX(ad_creative_call_to_action_type) AS call_to_action,
        MAX(sm_channel) AS channel,
        SUM(ad_spend) AS spend,
        SUM(ad_impressions) AS impressions,
        SUM(ad_clicks) AS clicks,
        SUM(ad_platform_reported_conversions) AS conversions,
        SAFE_DIVIDE(SUM(ad_clicks), SUM(ad_impressions)) AS ctr
      FROM ${warehouse.table(CREATIVE_RELATION)}
      WHERE sm_store_id = @store_id
        AND date BETWEEN @start_date AND @end_date
        AND ad_creative_id IS NOT NULL
      GROUP BY creative_id
      ORDER BY ${ORDER_BY[filters.sort]} NULLS LAST, creative_id
      LIMIT @limit`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "start_date", type: "DATE", value: filters.range.from },
      { name: "end_date", type: "DATE", value: filters.range.to },
      { name: "limit", type: "INT64", value: MAX_CREATIVES + 1 },
    ],
  });
  return {
    creatives: decodeRows(CreativeRow, result.rows, CREATIVE_RELATION).map(toCreative),
    truncated: result.truncated,
  };
}
