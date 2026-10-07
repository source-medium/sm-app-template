/**
 * Paid marketing, live. Both reads aggregate in SQL before any bound: the
 * series to channel by day, the table to campaign over the range.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { decodeRows } from "@/lib/data/decode";
import { WarehouseError } from "@/lib/data/warehouse-error";
import type { DateRange } from "@/lib/filters";
import type { BreakdownDimension, SpendBreakdown } from "./queries";
import { SpendBreakdownRow, MAX_BREAKDOWN } from "./rows";
import type { CampaignData, PaidMarketingData, PaidMarketingFilters } from "./queries";
import { AD_RELATION, CampaignWireRow, ChannelDayRow, MAX_CAMPAIGNS, toCampaign, toChannelDay } from "./rows";

/** Channels times days: 90 days of up to ~20 channels. Past this bound is an error. */
const MAX_SERIES_ROWS = 2000;

const BREAKDOWN_SQL = {
  channel: { key: "IFNULL(sm_channel, '(none)')", label: "IFNULL(sm_channel, '(none)')" },
  campaign: { key: "IFNULL(ad_campaign_id, '(none)')", label: "COALESCE(ad_campaign_name, ad_campaign_id, '(none)')" },
} as const;

/** Full-period totals are calculated before the top-N limit; both periods have identical store/channel scope. */
export async function querySpendBreakdown(
  filters: PaidMarketingFilters,
  dimension: BreakdownDimension,
  baseline: DateRange | null,
): Promise<SpendBreakdown> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const selection = BREAKDOWN_SQL[dimension];
  const result = await warehouse.query({
    name: "paid_spend_breakdown",
    maxRows: MAX_BREAKDOWN + 1,
    sql: `WITH grouped AS (
      SELECT ${selection.key} AS dimension_key, MAX(${selection.label}) AS label,
        SUM(IF(date BETWEEN @start_date AND @end_date, ad_spend, NULL)) AS spend,
        SUM(IF(@compare AND date BETWEEN @baseline_from AND @baseline_to, ad_spend, NULL)) AS previous_spend
      FROM ${warehouse.table(AD_RELATION)}
      WHERE sm_store_id = @store_id
        AND ((date BETWEEN @start_date AND @end_date) OR (@compare AND date BETWEEN @baseline_from AND @baseline_to))
        AND (@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)
      GROUP BY dimension_key
    )
    SELECT *, SUM(spend) OVER () AS total_spend, MIN(spend) OVER () AS minimum_spend
    FROM grouped ORDER BY spend DESC NULLS LAST, dimension_key LIMIT ${MAX_BREAKDOWN + 1}`,
    params: [
      ...queryScope(filters),
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      { name: "compare", type: "BOOL", value: baseline !== null },
      { name: "baseline_from", type: "DATE", value: baseline?.from ?? filters.range.from },
      { name: "baseline_to", type: "DATE", value: baseline?.to ?? filters.range.to },
    ],
  });
  if (result.truncated) throw new WarehouseError("result_too_large", { reason: "paid_spend_breakdown" });
  const rows = decodeRows(SpendBreakdownRow, result.rows, AD_RELATION);
  return { rows: rows.slice(0, MAX_BREAKDOWN), hasMore: rows.length > MAX_BREAKDOWN };
}

export async function queryPaidMarketing(filters: PaidMarketingFilters): Promise<PaidMarketingData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const table = warehouse.table(AD_RELATION);

  const [series, campaigns] = await Promise.all([
    warehouse.query({
      name: "paid_channel_daily",
      maxRows: MAX_SERIES_ROWS,
      sql: `
        SELECT
          IFNULL(sm_channel, '(none)') AS channel,
          date,
          SUM(ad_spend) AS spend,
          SUM(ad_impressions) AS impressions,
          SUM(ad_clicks) AS clicks,
          SUM(ad_platform_reported_conversions) AS conversions
        FROM ${table}
        WHERE sm_store_id = @store_id
          AND date BETWEEN @start_date AND @end_date
        GROUP BY channel, date
        ORDER BY date, channel`,
      params: queryScope(filters),
    }),
    queryPaidCampaigns(filters),
  ]);

  if (series.truncated) throw new WarehouseError("result_too_large", { reason: "paid_channel_daily" });
  return {
    channelDays: decodeRows(ChannelDayRow, series.rows, AD_RELATION).map(toChannelDay),
    ...campaigns,
  };
}

/** The same bounded campaign read serves the table and CSV, without rerunning the chart query. */
export async function queryPaidCampaigns(filters: PaidMarketingFilters): Promise<CampaignData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const table = warehouse.table(AD_RELATION);
  const campaigns = await warehouse.query({
    name: "paid_campaigns",
    maxRows: MAX_CAMPAIGNS,
    sql: `
        SELECT
          ad_campaign_id AS campaign_id,
          MAX(ad_campaign_name) AS campaign_name,
          MAX(sm_channel) AS channel,
          SUM(ad_spend) AS spend,
          SUM(ad_impressions) AS impressions,
          SUM(ad_clicks) AS clicks,
          SUM(ad_platform_reported_conversions) AS conversions,
          SUM(ad_platform_reported_revenue) AS platform_revenue
        FROM ${table}
        WHERE sm_store_id = @store_id
          AND date BETWEEN @start_date AND @end_date
          AND ad_campaign_id IS NOT NULL
          AND (@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)
        GROUP BY campaign_id
        ORDER BY spend DESC, impressions DESC, campaign_id
        LIMIT @limit`,
    params: [
      ...queryScope(filters),
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      { name: "limit", type: "INT64", value: MAX_CAMPAIGNS + 1 },
    ],
  });
  return {
    campaigns: decodeRows(CampaignWireRow, campaigns.rows, AD_RELATION).map(toCampaign),
    campaignsTruncated: campaigns.truncated,
  };
}

function queryScope(filters: PaidMarketingFilters) {
  return [
    { name: "store_id", type: "STRING", value: filters.storeId },
    { name: "start_date", type: "DATE", value: filters.range.from },
    { name: "end_date", type: "DATE", value: filters.range.to },
  ] as const;
}
