/**
 * Paid marketing's data contract, from rpt_ad_performance_daily (grain: ad
 * by day). Two reads: channel-by-day series for every channel, and a
 * campaign breakdown filtered to one channel or all.
 *
 * Spend is money and stays out until a reporting currency is verified
 * (docs/data.md, "Money and currency"). Impressions, clicks, and
 * platform-reported conversions are not money.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import { queryPaidMarketing } from "./bigquery";
import { samplePaidMarketing } from "./sample";

export const PAID_METRICS = ["impressions", "clicks", "conversions"] as const;
export type PaidMetric = (typeof PAID_METRICS)[number];

export type AdMeasures = {
  impressions: bigint | null;
  clicks: bigint | null;
  /** FLOAT64: platform-reported, can be fractional. */
  conversions: number | null;
};

export type ChannelDay = AdMeasures & { channel: string; date: string };
export type CampaignRow = AdMeasures & { campaignId: string; campaignName: string | null; channel: string | null };

export type PaidMarketingFilters = ReportFilters & { channel: string | null };

export type PaidMarketingData = {
  /** Every channel, so a channel filter never repaints the others. */
  channelDays: ChannelDay[];
  campaigns: CampaignRow[];
  campaignsTruncated: boolean;
};

export async function getPaidMarketing(filters: PaidMarketingFilters): Promise<PaidMarketingData> {
  const access = await requireViewer();
  return access.mode === "live" ? queryPaidMarketing(filters) : samplePaidMarketing(filters);
}
