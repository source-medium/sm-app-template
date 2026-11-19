/**
 * Sample ad delivery: synthetic campaign-by-ad-by-day rows, the one source
 * every sample view that reads rpt_ad_performance_daily or its ad spend sums,
 * so Paid marketing, Creatives and Overview agree. Spend is whole cents so
 * sums stay exact; source_system is the ad platform and sm_channel the sales
 * channel.
 */
import { datesInRange, type DateRange } from "@/lib/filters";
import { randomInt, seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { sampleAdNames, SAMPLE_CAMPAIGN_NAMES } from "@/lib/sample/ad-names";
import type { AdNames } from "@/lib/ad-name-filters";

const CAMPAIGNS = [
  {
    id: "cmp-1001",
    type: "Social",
    tactic: "Prospecting",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-1001"],
    source_system: "meta_ads",
    reach: 1,
    cpm: 1180,
  },
  {
    id: "cmp-1002",
    type: "Social",
    tactic: "Retargeting",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-1002"],
    source_system: "meta_ads",
    reach: 0.45,
    cpm: 1640,
  },
  {
    id: "cmp-1003",
    type: "Social",
    tactic: "Mixed",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-1003"],
    source_system: "meta_ads",
    reach: 0.8,
    cpm: 1320,
  },
  {
    id: "cmp-2001",
    type: "Search",
    tactic: "Brand",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-2001"],
    source_system: "google_ads",
    reach: 0.3,
    cpm: 2650,
  },
  {
    id: "cmp-2002",
    type: "Cross-network",
    tactic: "Mixed",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-2002"],
    source_system: "google_ads",
    reach: 0.9,
    cpm: 980,
  },
  {
    id: "cmp-3001",
    type: "Social",
    tactic: "Prospecting",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-3001"],
    source_system: "tiktok_ads",
    reach: 0.6,
    cpm: 760,
  },
  {
    id: "cmp-4001",
    type: "Shopping",
    tactic: "Prospecting",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-4001"],
    source_system: "pinterest_ads",
    reach: 0.25,
    cpm: 640,
  },
] as const;

export type PaidSourceRow = {
  names: AdNames;
  source_system: string;
  sm_channel: string;
  campaign: (typeof CAMPAIGNS)[number];
  date: string;
  spendCents: bigint;
  impressions: bigint;
  clicks: bigint;
  conversions: number;
  platformRevenue: number;
};

export function samplePaidSource(storeId: string, range: DateRange): PaidSourceRow[] {
  const scale = SAMPLE_STORE_SCALE.get(storeId);
  if (scale === undefined) return [];
  const rows: PaidSourceRow[] = [];
  for (const date of datesInRange(range)) {
    for (const campaign of CAMPAIGNS) {
      const random = seededRandom(`paid|${storeId}|${campaign.id}|${date}`);
      const impressions = Math.round(42_000 * scale * campaign.reach * (0.75 + random() * 0.5));
      const clicks = Math.round(impressions * (0.006 + random() * 0.012)) + randomInt(random, 0, 3);
      // Platforms report modeled conversions, so the value can be fractional.
      const conversions = Math.round(clicks * (0.02 + random() * 0.03) * 4) / 4;
      const total = {
        source_system: campaign.source_system,
        sm_channel: "online_dtc",
        campaign,
        date,
        spendCents: BigInt(Math.round((impressions / 1000) * campaign.cpm * (0.9 + random() * 0.2))),
        impressions: BigInt(impressions),
        clicks: BigInt(clicks),
        conversions,
        platformRevenue: Math.round(conversions * 7100 * (0.8 + random() * 0.4)) / 100,
      };
      // Two ads per campaign, split before filtering; their sums retain the original daily totals.
      const first = {
        spendCents: total.spendCents / 2n,
        impressions: total.impressions / 2n,
        clicks: total.clicks / 2n,
        conversions: total.conversions / 2,
        platformRevenue: total.platformRevenue / 2,
      };
      rows.push({ ...total, ...first, names: sampleAdNames(campaign.id, 0) });
      rows.push({
        ...total,
        spendCents: total.spendCents - first.spendCents,
        impressions: total.impressions - first.impressions,
        clicks: total.clicks - first.clicks,
        conversions: total.conversions - first.conversions,
        platformRevenue: total.platformRevenue - first.platformRevenue,
        names: sampleAdNames(campaign.id, 1),
      });
    }
  }
  return rows;
}
