/**
 * Paid marketing, sample. Synthetic campaign-by-day rows aggregated exactly
 * as the live SQL does, in BigQuery's wire format, decoded through the same
 * row schemas. Spend is generated in whole cents so sums stay exact.
 */
import { decodeRows } from "@/lib/data/decode";
import { fromUnits } from "@/lib/data/decimal";
import { datesInRange, latestDate, type DateRange } from "@/lib/filters";
import { randomInt, seededRandom } from "@/lib/sample/random";
import { SAMPLE_STORE_SCALE } from "@/lib/sample/stores";
import { sampleAdNames, sampleNameMatches, SAMPLE_CAMPAIGN_NAMES } from "@/lib/sample/ad-names";
import { matchesAdNames, type AdNames } from "@/lib/ad-name-filters";
import type { PaidMarketingData, PaidMarketingFilters } from "./queries";
import { AD_RELATION, CampaignWireRow, ChannelDayRow, MAX_CAMPAIGNS, toCampaign, toChannelDay } from "./rows";
import { SpendBreakdownRow, MAX_BREAKDOWN } from "./rows";
import type { BreakdownDimension, SpendBreakdown } from "./queries";
import type { BaselineRanges } from "@/lib/comparison";

const CAMPAIGNS = [
  {
    id: "cmp-1001",
    type: "Social",
    tactic: "Prospecting",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-1001"],
    channel: "Meta",
    reach: 1,
    cpm: 1180,
  },
  {
    id: "cmp-1002",
    type: "Social",
    tactic: "Retargeting",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-1002"],
    channel: "Meta",
    reach: 0.45,
    cpm: 1640,
  },
  {
    id: "cmp-1003",
    type: "Social",
    tactic: "Mixed",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-1003"],
    channel: "Meta",
    reach: 0.8,
    cpm: 1320,
  },
  {
    id: "cmp-2001",
    type: "Search",
    tactic: "Brand",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-2001"],
    channel: "Google",
    reach: 0.3,
    cpm: 2650,
  },
  {
    id: "cmp-2002",
    type: "Cross-network",
    tactic: "Mixed",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-2002"],
    channel: "Google",
    reach: 0.9,
    cpm: 980,
  },
  {
    id: "cmp-3001",
    type: "Social",
    tactic: "Prospecting",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-3001"],
    channel: "TikTok",
    reach: 0.6,
    cpm: 760,
  },
  {
    id: "cmp-4001",
    type: "Shopping",
    tactic: "Prospecting",
    name: SAMPLE_CAMPAIGN_NAMES["cmp-4001"],
    channel: "Pinterest",
    reach: 0.25,
    cpm: 640,
  },
] as const;

export type PaidSourceRow = {
  names: AdNames;
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
        channel: campaign.channel,
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

const money = (cents: bigint) => fromUnits(cents * 10_000_000n);

export async function sampleSpendBreakdown(
  filters: PaidMarketingFilters,
  dimension: BreakdownDimension,
  baselines: BaselineRanges,
): Promise<SpendBreakdown> {
  const grouped = new Map<
    string,
    { label: string; spend: bigint | null; previous: bigint | null; second: bigint | null }
  >();
  const dates = { spend: new Set<string>(), previous: new Set<string>(), second: new Set<string>() };
  for (const [period, range] of [
    ["spend", filters.range],
    ["previous", baselines[0]],
    ["second", baselines[1]],
  ] as const) {
    if (!range) continue;
    for (const row of samplePaidSource(filters.storeId, range)) {
      if (filters.channel && row.channel !== filters.channel) continue;
      if (!matchesAdNames(row.names, filters.names)) continue;
      const key =
        dimension === "channel"
          ? row.channel
          : dimension === "campaign"
            ? `${row.channel} / ${row.campaign.id}`
            : row.campaign[dimension];
      const sums = grouped.get(key) ?? {
        label:
          dimension === "channel"
            ? row.channel
            : dimension === "campaign"
              ? row.campaign.name
              : row.campaign[dimension],
        spend: null,
        previous: null,
        second: null,
      };
      sums[period] = (sums[period] ?? 0n) + row.spendCents;
      grouped.set(key, sums);
      dates[period].add(row.date);
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
      second_spend: row.second === null ? null : money(row.second),
      total_spend: total === null ? null : money(total),
      minimum_spend: minimum === null ? null : money(minimum),
      latest_date: latestDate(dates.spend),
      previous_latest_date: latestDate(dates.previous),
      second_latest_date: latestDate(dates.second),
    }))
    .filter((row) => row.spend !== null);
  return {
    rows: decodeRows(SpendBreakdownRow, wire.slice(0, MAX_BREAKDOWN), AD_RELATION),
    hasMore: wire.length > MAX_BREAKDOWN,
  };
}

export async function samplePaidMarketing(filters: PaidMarketingFilters): Promise<PaidMarketingData> {
  const source = samplePaidSource(filters.storeId, filters.range).filter((row) =>
    matchesAdNames(row.names, filters.names),
  );

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
      platform_revenue: String(sums.revenue),
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

export function samplePaidNames(filters: PaidMarketingFilters) {
  return sampleNameMatches(
    samplePaidSource(filters.storeId, filters.range)
      .filter(
        (row) => (!filters.channel || row.channel === filters.channel) && matchesAdNames(row.names, filters.names),
      )
      .map((row) => row.names),
  );
}
