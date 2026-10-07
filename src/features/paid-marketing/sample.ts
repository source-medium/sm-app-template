/**
 * Paid marketing, sample. Synthetic campaign-by-day rows aggregated exactly
 * as the live SQL does, in BigQuery's wire format, decoded through the same
 * row schemas. Spend is generated in whole cents so sums stay exact.
 */
import { decodeRows } from "@/lib/data/decode";
import { fromUnits } from "@/lib/data/decimal";
import { datesInRange, type DateRange } from "@/lib/filters";
import { randomInt, seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import type { PaidMarketingData, PaidMarketingFilters } from "./queries";
import { AD_RELATION, CampaignWireRow, ChannelDayRow, MAX_CAMPAIGNS, toCampaign, toChannelDay } from "./rows";
import { SpendBreakdownRow, MAX_BREAKDOWN } from "./rows";
import type { BreakdownDimension, SpendBreakdown } from "./queries";

const CAMPAIGNS = [
  { id: "cmp-1001", name: "Prospecting – Broad", channel: "Meta", reach: 1, cpm: 1180 },
  { id: "cmp-1002", name: "Retargeting – Site Visitors", channel: "Meta", reach: 0.45, cpm: 1640 },
  { id: "cmp-1003", name: "Advantage+ Shopping", channel: "Meta", reach: 0.8, cpm: 1320 },
  { id: "cmp-2001", name: "Brand Search", channel: "Google", reach: 0.3, cpm: 2650 },
  { id: "cmp-2002", name: "Performance Max", channel: "Google", reach: 0.9, cpm: 980 },
  { id: "cmp-3001", name: "Spark Ads – Creators", channel: "TikTok", reach: 0.6, cpm: 760 },
  { id: "cmp-4001", name: "Pinterest Shopping", channel: "Pinterest", reach: 0.25, cpm: 640 },
] as const;

export type PaidSourceRow = {
  channel: string;
  campaign: (typeof CAMPAIGNS)[number];
  date: string;
  spendCents: bigint;
  impressions: bigint;
  clicks: bigint;
  conversions: number;
  platformRevenue: number;
};

export function samplePaidSource(storeId: string, range: DateRange): PaidSourceRow[] {
  const scale = SAMPLE_STORE_SCALE[storeId] ?? 0;
  const rows: PaidSourceRow[] = [];
  for (const date of datesInRange(range)) {
    for (const campaign of CAMPAIGNS) {
      const random = seededRandom(`paid|${storeId}|${campaign.id}|${date}`);
      const impressions = Math.round(42_000 * scale * campaign.reach * (0.75 + random() * 0.5));
      const clicks = Math.round(impressions * (0.006 + random() * 0.012)) + randomInt(random, 0, 3);
      // Platforms report modeled conversions, so the value can be fractional.
      const conversions = Math.round(clicks * (0.02 + random() * 0.03) * 4) / 4;
      rows.push({
        channel: campaign.channel,
        campaign,
        date,
        spendCents: BigInt(Math.round((impressions / 1000) * campaign.cpm * (0.9 + random() * 0.2))),
        impressions: BigInt(impressions),
        clicks: BigInt(clicks),
        conversions,
        platformRevenue: Math.round(conversions * 7100 * (0.8 + random() * 0.4)) / 100,
      });
    }
  }
  return rows;
}

const money = (cents: bigint) => fromUnits(cents * 10_000_000n);

export async function sampleSpendBreakdown(
  filters: PaidMarketingFilters,
  dimension: BreakdownDimension,
  baseline: DateRange | null,
): Promise<SpendBreakdown> {
  const grouped = new Map<string, { label: string; spend: bigint | null; previous: bigint | null }>();
  for (const [period, range] of [
    ["spend", filters.range],
    ["previous", baseline],
  ] as const) {
    if (!range) continue;
    for (const row of samplePaidSource(filters.storeId, range)) {
      if (filters.channel && row.channel !== filters.channel) continue;
      const key = dimension === "channel" ? row.channel : row.campaign.id;
      const sums = grouped.get(key) ?? {
        label: dimension === "channel" ? row.channel : row.campaign.name,
        spend: null,
        previous: null,
      };
      sums[period] = (sums[period] ?? 0n) + row.spendCents;
      grouped.set(key, sums);
    }
  }
  const current = [...grouped.values()].flatMap((row) => (row.spend === null ? [] : [row.spend]));
  const total = current.length ? current.reduce((a, b) => a + b, 0n) : null;
  const minimum = current.length ? current.reduce((a, b) => (a < b ? a : b)) : null;
  const wire = [...grouped]
    .sort(([a, x], [b, y]) =>
      x.spend === y.spend
        ? a.localeCompare(b)
        : x.spend === null
          ? 1
          : y.spend === null
            ? -1
            : x.spend > y.spend
              ? -1
              : 1,
    )
    .map(([key, row]) => ({
      dimension_key: key,
      label: row.label,
      spend: row.spend === null ? null : money(row.spend),
      previous_spend: row.previous === null ? null : money(row.previous),
      total_spend: total === null ? null : money(total),
      minimum_spend: minimum === null ? null : money(minimum),
    }));
  return {
    rows: decodeRows(SpendBreakdownRow, wire.slice(0, MAX_BREAKDOWN), AD_RELATION),
    hasMore: wire.length > MAX_BREAKDOWN,
  };
}

export async function samplePaidMarketing(filters: PaidMarketingFilters): Promise<PaidMarketingData> {
  const source = samplePaidSource(filters.storeId, filters.range);

  type Sums = { spend: bigint; impressions: bigint; clicks: bigint; conversions: number; revenue: number };
  const empty = (): Sums => ({ spend: 0n, impressions: 0n, clicks: 0n, conversions: 0, revenue: 0 });
  const add = (sums: Sums, row: PaidSourceRow) => {
    sums.spend += row.spendCents;
    sums.impressions += row.impressions;
    sums.clicks += row.clicks;
    sums.conversions += row.conversions;
    sums.revenue += row.platformRevenue;
  };

  const series = new Map<string, Sums & { channel: string; date: string }>();
  for (const row of source) {
    const key = `${row.date}|${row.channel}`;
    const sums = series.get(key) ?? { ...empty(), channel: row.channel, date: row.date };
    add(sums, row);
    series.set(key, sums);
  }
  const seriesWire = [...series.values()]
    .sort((a, b) => a.date.localeCompare(b.date) || a.channel.localeCompare(b.channel))
    .map((sums) => ({
      channel: sums.channel,
      date: sums.date,
      spend: money(sums.spend),
      impressions: String(sums.impressions),
      clicks: String(sums.clicks),
      conversions: String(sums.conversions),
    }));

  const campaigns = new Map<string, Sums & { id: string; name: string; channel: string }>();
  for (const row of source) {
    if (filters.channel && row.channel !== filters.channel) continue;
    const sums = campaigns.get(row.campaign.id) ?? {
      ...empty(),
      id: row.campaign.id,
      name: row.campaign.name,
      channel: row.channel,
    };
    add(sums, row);
    campaigns.set(row.campaign.id, sums);
  }
  const campaignWire = [...campaigns.values()]
    .sort((a, b) => (a.spend === b.spend ? a.id.localeCompare(b.id) : a.spend > b.spend ? -1 : 1))
    .map((sums) => ({
      campaign_id: sums.id,
      campaign_name: sums.name,
      channel: sums.channel,
      spend: money(sums.spend),
      impressions: String(sums.impressions),
      clicks: String(sums.clicks),
      conversions: String(sums.conversions),
      platform_revenue: String(sums.revenue),
    }));

  return {
    channelDays: decodeRows(ChannelDayRow, seriesWire, AD_RELATION).map(toChannelDay),
    campaigns: decodeRows(CampaignWireRow, campaignWire.slice(0, MAX_CAMPAIGNS), AD_RELATION).map(toCampaign),
    campaignsTruncated: campaignWire.length > MAX_CAMPAIGNS,
  };
}
