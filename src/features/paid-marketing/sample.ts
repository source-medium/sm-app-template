/**
 * Paid marketing, sample. The shared sample ad delivery (lib/sample/ad-delivery)
 * aggregated exactly as the live SQL does, in BigQuery's wire format, decoded
 * through the same row schemas.
 */
import { decodeRows } from "@/lib/data/decode";
import { fromUnits } from "@/lib/data/decimal";
import { latestDate } from "@/lib/filters";
import { sampleNameMatches } from "@/lib/sample/ad-names";
import { samplePaidSource, type PaidSourceRow } from "@/lib/sample/ad-delivery";
import { matchesAdNames } from "@/lib/ad-name-filters";
import type { PaidMarketingData, PaidMarketingFilters, PaidSummary } from "./queries";
import { AD_RELATION, CampaignWireRow, ChannelDayRow, MAX_CAMPAIGNS, toCampaign, toChannelDay } from "./rows";
import { SpendBreakdownRow, MAX_BREAKDOWN, PaidSummaryRow, toPaidSummary } from "./rows";
import { PERIOD_PREFIXES } from "@/lib/data/period-sql";
import type { SpendBreakdown } from "./queries";
import type { BreakdownDimension } from "./filters";
import type { BaselineRanges } from "@/lib/comparison";

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
      if (filters.channel && row.source_system !== filters.channel) continue;
      if (!matchesAdNames(row.names, filters.names)) continue;
      const key =
        dimension === "channel"
          ? row.source_system
          : dimension === "campaign"
            ? `${row.source_system} / ${row.campaign.id}`
            : row.campaign[dimension];
      const sums = grouped.get(key) ?? {
        label:
          dimension === "channel"
            ? row.source_system
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

/** The KPIs' sums in each period, over the same rows and filters as the breakdown. */
export async function samplePaidSummary(
  filters: PaidMarketingFilters,
  baselines: BaselineRanges,
): Promise<PaidSummary> {
  const ranges = [filters.range, baselines[0], baselines[1]] as const;
  const wire: Record<string, string | null> = {};
  PERIOD_PREFIXES.forEach((prefix, index) => {
    const range = ranges[index];
    const rows = range
      ? samplePaidSource(filters.storeId, range).filter(
          (row) =>
            (!filters.channel || row.source_system === filters.channel) && matchesAdNames(row.names, filters.names),
        )
      : [];
    const some = rows.length > 0;
    wire[`${prefix}spend`] = some ? money(rows.reduce((sum, row) => sum + row.spendCents, 0n)) : null;
    wire[`${prefix}impressions`] = some ? String(rows.reduce((sum, row) => sum + row.impressions, 0n)) : null;
    wire[`${prefix}clicks`] = some ? String(rows.reduce((sum, row) => sum + row.clicks, 0n)) : null;
    wire[`${prefix}conversions`] = some ? String(rows.reduce((sum, row) => sum + row.conversions, 0)) : null;
    wire[`${prefix}revenue`] = some ? String(rows.reduce((sum, row) => sum + row.platformRevenue, 0)) : null;
    wire[`${prefix}latest_date`] = latestDate(new Set(rows.map((row) => row.date)));
  });
  return toPaidSummary(decodeRows(PaidSummaryRow, [wire], AD_RELATION)[0]);
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
    const key = `${row.date}|${row.source_system}`;
    const sums = series.get(key) ?? { ...empty(), channel: row.source_system, date: row.date };
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

  // A campaign is its ad platform and ID, as in the live SQL.
  const campaigns = new Map<string, Sums & { id: string; name: string; channel: string }>();
  for (const row of source) {
    if (filters.channel && row.source_system !== filters.channel) continue;
    const key = `${row.source_system} / ${row.campaign.id}`;
    const sums = campaigns.get(key) ?? {
      ...empty(),
      id: row.campaign.id,
      name: row.campaign.name,
      channel: row.source_system,
    };
    add(sums, row);
    campaigns.set(key, sums);
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
        (row) =>
          (!filters.channel || row.source_system === filters.channel) && matchesAdNames(row.names, filters.names),
      )
      .map((row) => row.names),
  );
}
