/**
 * Creatives' data contract: rpt_ad_performance_daily aggregated to one row
 * per ad platform and creative, in the selected period and each comparison
 * period, plus a summary of the same scope (totals, formats and launch weeks).
 * Every platform publishes a creative identity; text, images and post links
 * depend on what each platform reports, and cards fall back to text.
 */
import "server-only";
import { parseCreativeSelection, type CreativeFormat, type CreativeIdentity, type CreativeSort } from "./filters";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import type { AdNameMatches, AdNameRule } from "@/lib/ad-name-filters";
import type { BaselineRanges, PeriodCoverage } from "@/lib/comparison";
import { queryAdNameMatches } from "@/lib/data/ad-name-matches.server";
import { queryCreativeChannels, queryCreativeSummary, queryCreatives } from "./bigquery";
import { sampleCreativeChannels, sampleCreatives, sampleCreativeNames, sampleCreativeSummary } from "./sample";

/** One period's delivery for a creative; ratios are of the period's sums, null without a denominator. */
export type CreativeMeasures = {
  /** NUMERIC, exact decimal text, in the reporting currency. */
  spend: string | null;
  impressions: bigint | null;
  clicks: bigint | null;
  conversions: number | null;
  revenue: number | null;
  roas: number | null;
  cpo: number | null;
  ctr: number | null;
};

export type Creative = CreativeMeasures & {
  creativeId: string;
  title: string | null;
  body: string | null;
  /** The platform's name for the creative, where it has one. */
  name: string | null;
  /** Hotlinked from the ad platform; it may expire. The card falls back to text. */
  imageUrl: string | null;
  callToAction: string | null;
  /** The ad platform: source_system (src/lib/ad-platforms.ts), not the sales channel. */
  channel: string;
  /** ad_creative_format as published (CREATIVE_FORMATS), or null. */
  format: string | null;
  /** First day with spend since the lookback began (LAUNCH_LOOKBACK_DAYS before the range). */
  firstDate: string | null;
  /** Whether that first day falls in the selected range: a creative new in these dates. */
  launched: boolean;
  /** The same creative in each comparison slot's period. */
  baselines: readonly [CreativeMeasures, CreativeMeasures];
  adUrl: string | null;
};

export type CreativesFilters = ReportFilters & {
  sort: CreativeSort;
  channel?: string | null;
  campaign?: string | null;
  format?: CreativeFormat | null;
  names?: AdNameRule[];
  minimumSpend?: string | null;
  minimumConversions?: string | null;
  selection?: readonly CreativeIdentity[];
};
export type CreativesData = {
  creatives: Creative[];
  truncated: boolean;
  /** Each period's latest date with rows across every creative in scope, for slotChanges(). */
  coverage: PeriodCoverage | null;
};

/** One group's sums in one period; `creatives` counts creatives with spend. */
export type CreativeSummaryGroup = {
  spend: string | null;
  impressions: bigint | null;
  clicks: bigint | null;
  conversions: number | null;
  revenue: number | null;
  creatives: bigint | null;
};
type Periods = { current: CreativeSummaryGroup; baselines: readonly [CreativeSummaryGroup, CreativeSummaryGroup] };

export type CreativeSummary = {
  /** The whole scope (store, platform, campaign, format and name filters); null without delivery. */
  totals: Periods | null;
  /** Creatives whose first spend falls in the selected range. */
  newCreatives: bigint | null;
  /** Selected-period spend on delivery with no creative identity; null when there is none. */
  uncoveredSpend: string | null;
  coverage: PeriodCoverage | null;
  formats: ({ format: string | null } & Periods)[];
  /** Selected-period delivery by launch week; `week` null is creatives running before the range. */
  launches: ({ week: string | null } & CreativeSummaryGroup)[];
};

export async function getCreatives(filters: CreativesFilters, baselines: BaselineRanges): Promise<CreativesData> {
  const access = await requireViewer({ storeId: filters.storeId });
  if (
    filters.selection &&
    (filters.selection.length === 0 || parseCreativeSelection({ selection: JSON.stringify(filters.selection) }).error)
  )
    throw new Error("Invalid creative selection");
  return access.mode === "live" ? queryCreatives(filters, baselines) : sampleCreatives(filters, baselines);
}

export async function getCreativeSummary(
  filters: CreativesFilters,
  baselines: BaselineRanges,
): Promise<CreativeSummary> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryCreativeSummary(filters, baselines) : sampleCreativeSummary(filters, baselines);
}

export async function getCreativeChannels(filters: ReportFilters): Promise<string[]> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryCreativeChannels(filters) : sampleCreativeChannels(filters);
}

export async function getCreativeNames(filters: CreativesFilters): Promise<AdNameMatches> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryAdNameMatches(filters, true) : sampleCreativeNames(filters);
}
