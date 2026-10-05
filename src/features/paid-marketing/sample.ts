/**
 * Paid marketing, sample. Synthetic campaign-by-day rows aggregated exactly
 * as the live SQL does, in BigQuery's wire format, decoded through the same
 * row schemas.
 */
import { decodeRows } from "@/lib/data/decode";
import { datesInRange, type DateRange } from "@/lib/filters";
import { randomInt, seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import type { PaidMarketingData, PaidMarketingFilters } from "./queries";
import { AD_RELATION, CampaignWireRow, ChannelDayRow, MAX_CAMPAIGNS, toCampaign, toChannelDay } from "./rows";

const CAMPAIGNS = [
  { id: "cmp-1001", name: "Prospecting – Broad", channel: "Meta", reach: 1 },
  { id: "cmp-1002", name: "Retargeting – Site Visitors", channel: "Meta", reach: 0.45 },
  { id: "cmp-1003", name: "Advantage+ Shopping", channel: "Meta", reach: 0.8 },
  { id: "cmp-2001", name: "Brand Search", channel: "Google", reach: 0.3 },
  { id: "cmp-2002", name: "Performance Max", channel: "Google", reach: 0.9 },
  { id: "cmp-3001", name: "Spark Ads – Creators", channel: "TikTok", reach: 0.6 },
  { id: "cmp-4001", name: "Pinterest Shopping", channel: "Pinterest", reach: 0.25 },
] as const;

type SourceRow = {
  channel: string;
  campaign: (typeof CAMPAIGNS)[number];
  date: string;
  impressions: bigint;
  clicks: bigint;
  conversions: number;
};

export function samplePaidSource(storeId: string, range: DateRange): SourceRow[] {
  const scale = SAMPLE_STORE_SCALE[storeId] ?? 0;
  const rows: SourceRow[] = [];
  for (const date of datesInRange(range)) {
    for (const campaign of CAMPAIGNS) {
      const random = seededRandom(`paid|${storeId}|${campaign.id}|${date}`);
      const impressions = Math.round(42_000 * scale * campaign.reach * (0.75 + random() * 0.5));
      const clicks = Math.round(impressions * (0.006 + random() * 0.012));
      // Platforms report modeled conversions, so the value can be fractional.
      const conversions = Math.round(clicks * (0.02 + random() * 0.03) * 4) / 4;
      rows.push({
        channel: campaign.channel,
        campaign,
        date,
        impressions: BigInt(impressions),
        clicks: BigInt(clicks + randomInt(random, 0, 3)),
        conversions,
      });
    }
  }
  return rows;
}

export async function samplePaidMarketing(filters: PaidMarketingFilters): Promise<PaidMarketingData> {
  const source = samplePaidSource(filters.storeId, filters.range);

  const series = new Map<
    string,
    { channel: string; date: string; impressions: bigint; clicks: bigint; conversions: number }
  >();
  for (const row of source) {
    const key = `${row.date}|${row.channel}`;
    const sums = series.get(key) ?? {
      channel: row.channel,
      date: row.date,
      impressions: 0n,
      clicks: 0n,
      conversions: 0,
    };
    sums.impressions += row.impressions;
    sums.clicks += row.clicks;
    sums.conversions += row.conversions;
    series.set(key, sums);
  }
  const seriesWire = [...series.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel))
    .map((sums) => ({
      ...sums,
      impressions: String(sums.impressions),
      clicks: String(sums.clicks),
      conversions: String(sums.conversions),
    }));

  const campaigns = new Map<
    string,
    {
      campaign_id: string;
      campaign_name: string;
      channel: string;
      impressions: bigint;
      clicks: bigint;
      conversions: number;
    }
  >();
  for (const row of source) {
    if (filters.channel && row.channel !== filters.channel) continue;
    const sums = campaigns.get(row.campaign.id) ?? {
      campaign_id: row.campaign.id,
      campaign_name: row.campaign.name,
      channel: row.channel,
      impressions: 0n,
      clicks: 0n,
      conversions: 0,
    };
    sums.impressions += row.impressions;
    sums.clicks += row.clicks;
    sums.conversions += row.conversions;
    campaigns.set(row.campaign.id, sums);
  }
  const campaignWire = [...campaigns.values()]
    .sort((a, b) =>
      a.impressions === b.impressions
        ? a.campaign_id.localeCompare(b.campaign_id)
        : a.impressions > b.impressions
          ? -1
          : 1,
    )
    .map((sums) => ({
      ...sums,
      impressions: String(sums.impressions),
      clicks: String(sums.clicks),
      conversions: String(sums.conversions),
    }));

  return {
    channelDays: decodeRows(ChannelDayRow, seriesWire, AD_RELATION).map(toChannelDay),
    campaigns: decodeRows(CampaignWireRow, campaignWire.slice(0, MAX_CAMPAIGNS), AD_RELATION).map(toCampaign),
    campaignsTruncated: campaignWire.length > MAX_CAMPAIGNS,
  };
}
