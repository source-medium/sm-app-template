import { z } from "zod";
import { appConfig } from "@/app.config";
import { bq } from "@/lib/data/decode";
import { periodCoverageFields, periodFields } from "@/lib/data/period-sql";
import { adTotals, adTotalsFields } from "@/lib/ad-totals";
import type { CampaignRow, ChannelDay, PaidSummary } from "./queries";

export const AD_RELATION = "rpt_ad_performance_daily";
/** The campaign table shows the top campaigns by spend; more is reported as truncation. */
export const MAX_CAMPAIGNS = 200;
export const MAX_BREAKDOWN = 10;
/** Platform-by-day series rows: the longest allowed range times up to 25 ad platforms. Past this bound is an error. */
export const MAX_SERIES_ROWS = appConfig.dateRange.maxDays * 25;
/** The scope's sums in each period: one row, with every period's latest date. */
export const PaidSummaryRow = z.object({ ...adTotalsFields, ...periodCoverageFields });

/** No selected-period delivery leaves the totals empty, so the page shows no KPI row. */
export function toPaidSummary(row: z.output<typeof PaidSummaryRow> | undefined): PaidSummary {
  if (!row || row.latest_date === null) return { totals: null, coverage: null };
  return {
    totals: { current: adTotals(row, ""), baselines: [adTotals(row, "previous_"), adTotals(row, "second_")] },
    coverage: {
      latest_date: row.latest_date,
      previous_latest_date: row.previous_latest_date,
      second_latest_date: row.second_latest_date,
    },
  };
}

export const SpendBreakdownRow = z.object({
  dimension_key: bq.string(),
  label: bq.string(),
  ...periodFields(["spend"], bq.numeric().nullable()),
  total_spend: bq.numeric().nullable(),
  minimum_spend: bq.numeric().nullable(),
  ...periodCoverageFields,
});

/** The delivery measures both reads sum, as AD_MEASURES_SQL in bigquery.ts selects them. */
const adMeasures = {
  spend: bq.numeric().nullable(),
  impressions: bq.int64().nullable(),
  clicks: bq.int64().nullable(),
  conversions: bq.float64().nullable(),
  platform_revenue: bq.float64().nullable(),
};

export const ChannelDayRow = z.object({ channel: bq.string(), date: bq.date(), ...adMeasures });

export const CampaignWireRow = z.object({
  campaign_id: bq.string(),
  campaign_name: bq.string().nullable(),
  channel: bq.string(),
  ...adMeasures,
});

export function toChannelDay(row: z.output<typeof ChannelDayRow>): ChannelDay {
  const { platform_revenue, ...measures } = row;
  return { ...measures, platformRevenue: platform_revenue };
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
