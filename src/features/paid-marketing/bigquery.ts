/**
 * Paid marketing, live. Both reads aggregate in SQL before any bound: the
 * series to channel by day, the table to campaign over the range.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { adNamePredicate } from "@/lib/data/ad-name-sql";
import { decodeRows } from "@/lib/data/decode";
import type { SpendBreakdown } from "./queries";
import type { BreakdownDimension } from "./filters";
import { PERIOD_COVERAGE, periodParams, periodSql } from "@/lib/data/period-sql";
import { SpendBreakdownRow, MAX_BREAKDOWN } from "./rows";
import type { CampaignData, PaidMarketingData, PaidMarketingFilters } from "./queries";
import { CACHE_POLICY } from "@/lib/data/query-cache";
import {
  AD_RELATION,
  CampaignWireRow,
  ChannelDayRow,
  MAX_CAMPAIGNS,
  MAX_SERIES_ROWS,
  toCampaign,
  toChannelDay,
} from "./rows";
import type { BaselineRanges } from "@/lib/comparison";

/** The delivery measures both reads sum; the row schemas in rows.ts decode them. */
const AD_MEASURES_SQL = `SUM(ad_spend) AS spend,
          SUM(ad_impressions) AS impressions,
          SUM(ad_clicks) AS clicks,
          SUM(ad_platform_reported_conversions) AS conversions,
          SUM(ad_platform_reported_revenue) AS platform_revenue`;

const BREAKDOWN_SQL = {
  type: {
    key: "COALESCE(NULLIF(ad_campaign_type, ''), '(none)')",
    label: "COALESCE(NULLIF(ad_campaign_type, ''), '(none)')",
  },
  tactic: {
    key: "COALESCE(NULLIF(ad_campaign_tactic, ''), '(none)')",
    label: "COALESCE(NULLIF(ad_campaign_tactic, ''), '(none)')",
  },
  channel: { key: "IFNULL(sm_channel, '(none)')", label: "IFNULL(sm_channel, '(none)')" },
  // Campaign IDs are unique within an ad platform, so the key names both.
  campaign: {
    key: "CONCAT(IFNULL(sm_channel, '(none)'), ' / ', IFNULL(ad_campaign_id, '(none)'))",
    label: "COALESCE(ad_campaign_name, ad_campaign_id, '(none)')",
  },
} as const;

/** Full-period totals are calculated before the top-N limit; both periods have identical store/channel scope. */
export async function querySpendBreakdown(
  filters: PaidMarketingFilters,
  dimension: BreakdownDimension,
  baselines: BaselineRanges,
): Promise<SpendBreakdown> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const selection = BREAKDOWN_SQL[dimension];
  const period = periodSql("date");
  const names = adNamePredicate(filters.names);
  const result = await warehouse.query({
    name: "paid_spend_breakdown",
    cache: CACHE_POLICY.aggregate,
    maxRows: MAX_BREAKDOWN + 1,
    sql: `WITH grouped AS (
      SELECT ${selection.key} AS dimension_key, MAX(${selection.label}) AS label,
        ${period.sum("ad_spend", "spend")},
        ${period.latest}
      FROM ${warehouse.table(AD_RELATION)}
      WHERE sm_store_id = @store_id
        AND ${period.rows}
        AND (@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)
        AND ${names.sql}
      GROUP BY dimension_key
    )
    SELECT ${PERIOD_COVERAGE},
      SUM(spend) OVER () AS total_spend, MIN(spend) OVER () AS minimum_spend
    FROM grouped ORDER BY spend DESC NULLS LAST, dimension_key LIMIT ${MAX_BREAKDOWN + 1}`,
    params: [
      { name: "store_id", type: "STRING", value: filters.storeId },
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      ...periodParams(filters.range, baselines[0], baselines[1]),
      ...names.params,
    ],
  });
  // Groups with spend only in a comparison period sort last; they have nothing to rank, so they never pad the list.
  const rows = decodeRows(SpendBreakdownRow, result.rows, AD_RELATION).filter((row) => row.spend !== null);
  return { rows: rows.slice(0, MAX_BREAKDOWN), hasMore: rows.length > MAX_BREAKDOWN };
}

export async function queryPaidMarketing(filters: PaidMarketingFilters): Promise<PaidMarketingData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const table = warehouse.table(AD_RELATION);
  const names = adNamePredicate(filters.names);

  const [series, campaigns] = await Promise.all([
    warehouse.query({
      name: "paid_channel_daily",
      cache: CACHE_POLICY.aggregate,
      maxRows: MAX_SERIES_ROWS,
      sql: `
        SELECT
          IFNULL(sm_channel, '(none)') AS channel,
          date,
          ${AD_MEASURES_SQL}
        FROM ${table}
        WHERE sm_store_id = @store_id
          AND date BETWEEN @start_date AND @end_date
          AND ${names.sql}
        GROUP BY channel, date
        ORDER BY date, channel`,
      params: [...queryScope(filters), ...names.params],
    }),
    queryPaidCampaigns(filters),
  ]);

  return {
    channelDays: decodeRows(ChannelDayRow, series.rows, AD_RELATION).map(toChannelDay),
    ...campaigns,
  };
}

/**
 * The same bounded campaign read serves the table and CSV, without rerunning the chart query.
 * Campaign IDs are unique within an ad platform, so a campaign is its channel and ID. Spend
 * without a campaign ID is not a campaign; the spend breakdown shows it as (none).
 */
export async function queryPaidCampaigns(filters: PaidMarketingFilters): Promise<CampaignData> {
  const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
  const table = warehouse.table(AD_RELATION);
  const names = adNamePredicate(filters.names);
  const campaigns = await warehouse.query({
    name: "paid_campaigns",
    cache: CACHE_POLICY.aggregate,
    partial: true,
    maxRows: MAX_CAMPAIGNS,
    sql: `
        SELECT
          ad_campaign_id AS campaign_id,
          MAX(ad_campaign_name) AS campaign_name,
          sm_channel AS channel,
          ${AD_MEASURES_SQL}
        FROM ${table}
        WHERE sm_store_id = @store_id
          AND date BETWEEN @start_date AND @end_date
          AND ad_campaign_id IS NOT NULL
          AND (@channel = '' OR IFNULL(sm_channel, '(none)') = @channel)
          AND ${names.sql}
        GROUP BY channel, campaign_id
        ORDER BY spend DESC, impressions DESC, campaign_id, channel
        LIMIT @limit`,
    params: [
      ...queryScope(filters),
      { name: "channel", type: "STRING", value: filters.channel ?? "" },
      { name: "limit", type: "INT64", value: MAX_CAMPAIGNS + 1 },
      ...names.params,
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
