/**
 * Paid marketing's data contract, from rpt_ad_performance_daily (grain: ad
 * by day). Two reads: channel-by-day series for every channel, and a
 * campaign breakdown filtered to one channel or all. Money is in the
 * warehouse's reporting currency.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import { single, type ReportFilters, type SearchParams } from "@/lib/filters";
import { decimalToNumber, ratio } from "@/lib/data/decimal";
import { toChartNumber } from "@/lib/data/decode";
import { queryPaidCampaigns, queryPaidMarketing } from "./bigquery";
import { samplePaidMarketing } from "./sample";

export const PAID_METRICS = ["spend", "impressions", "clicks", "conversions"] as const;
export type PaidMetric = (typeof PAID_METRICS)[number];

export type AdMeasures = {
  /** NUMERIC, exact decimal text: SUM(ad_spend). */
  spend: string | null;
  impressions: bigint | null;
  clicks: bigint | null;
  /** FLOAT64: platform-reported, can be fractional. */
  conversions: number | null;
};

export type ChannelDay = AdMeasures & { channel: string; date: string };
export type CampaignRow = AdMeasures & {
  campaignId: string;
  campaignName: string | null;
  channel: string | null;
  /** FLOAT64: revenue the ad platform attributes to itself. */
  platformRevenue: number | null;
};

export type PaidMarketingFilters = ReportFilters & { channel: string | null };

export type PaidMarketingData = {
  /** Every channel, so a channel filter never repaints the others. */
  channelDays: ChannelDay[];
  campaigns: CampaignRow[];
  campaignsTruncated: boolean;
};

export type CampaignData = Pick<PaidMarketingData, "campaigns" | "campaignsTruncated">;

export function paidChannel(params: SearchParams): string | null {
  return single(params, "channel")?.slice(0, 100) || null;
}

/** Ratios use the same totals in the report and download; missing or unsafe inputs stay missing. */
export function campaignRatios(row: CampaignRow) {
  const spend = decimalToNumber(row.spend);
  const impressions = row.impressions === null ? null : toChartNumber(row.impressions);
  const clicks = row.clicks === null ? null : toChartNumber(row.clicks);
  return { ctr: ratio(clicks, impressions), cpc: ratio(spend, clicks), roas: ratio(row.platformRevenue, spend) };
}

export async function getPaidMarketing(filters: PaidMarketingFilters): Promise<PaidMarketingData> {
  const access = await requireViewer();
  return access.mode === "live" ? queryPaidMarketing(filters) : samplePaidMarketing(filters);
}

export async function getPaidCampaigns(filters: PaidMarketingFilters): Promise<CampaignData> {
  const access = await requireViewer();
  return access.mode === "live" ? queryPaidCampaigns(filters) : samplePaidMarketing(filters);
}
