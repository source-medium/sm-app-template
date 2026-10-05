/**
 * Paid marketing's data contract, from rpt_ad_performance_daily (grain: ad
 * by day). Two reads: channel-by-day series for every channel, and a
 * campaign breakdown filtered to one channel or all. Money is in the
 * warehouse's reporting currency.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import { queryPaidMarketing } from "./bigquery";
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

export async function getPaidMarketing(filters: PaidMarketingFilters): Promise<PaidMarketingData> {
  const access = await requireViewer();
  return access.mode === "live" ? queryPaidMarketing(filters) : samplePaidMarketing(filters);
}
