import { z } from "zod";
import { bq } from "@/lib/data/decode";
import type { CampaignRow, ChannelDay } from "./queries";

export const AD_RELATION = "rpt_ad_performance_daily";
/** The campaign table shows the top campaigns by spend; more is reported as truncation. */
export const MAX_CAMPAIGNS = 200;
export const MAX_BREAKDOWN = 10;
export const SpendBreakdownRow = z.object({
  dimension_key: bq.string(),
  label: bq.string(),
  spend: bq.numeric().nullable(),
  previous_spend: bq.numeric().nullable(),
  total_spend: bq.numeric().nullable(),
  minimum_spend: bq.numeric().nullable(),
});

export const ChannelDayRow = z.object({
  channel: bq.string(),
  date: bq.date(),
  spend: bq.numeric().nullable(),
  impressions: bq.int64().nullable(),
  clicks: bq.int64().nullable(),
  conversions: bq.float64().nullable(),
});

export const CampaignWireRow = z.object({
  campaign_id: bq.string(),
  campaign_name: bq.string().nullable(),
  channel: bq.string().nullable(),
  spend: bq.numeric().nullable(),
  impressions: bq.int64().nullable(),
  clicks: bq.int64().nullable(),
  conversions: bq.float64().nullable(),
  platform_revenue: bq.float64().nullable(),
});

export function toChannelDay(row: z.output<typeof ChannelDayRow>): ChannelDay {
  return row;
}

export function toCampaign(row: z.output<typeof CampaignWireRow>): CampaignRow {
  return {
    campaignId: row.campaign_id,
    campaignName: row.campaign_name,
    channel: row.channel,
    spend: row.spend,
    impressions: row.impressions,
    clicks: row.clicks,
    conversions: row.conversions,
    platformRevenue: row.platform_revenue,
  };
}
