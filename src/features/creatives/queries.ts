/**
 * Creatives' data contract: rpt_ad_performance_daily aggregated to one row
 * per ad platform and creative over the range, sorted by a measure. Creative text and
 * image URLs are populated for Meta today; other platforms render as text
 * cards.
 */
import "server-only";
import { parseCreativeSelection, type CreativeIdentity, type CreativeSort } from "./filters";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import type { AdNameMatches, AdNameRule } from "@/lib/ad-name-filters";
import { queryAdNameMatches } from "@/lib/data/ad-name-matches.server";
import { queryCreativeChannels, queryCreatives } from "./bigquery";
import { sampleCreativeChannels, sampleCreatives, sampleCreativeNames } from "./sample";

export type Creative = {
  creativeId: string;
  title: string | null;
  body: string | null;
  /** Hotlinked from the ad platform; it may expire. The card falls back to text. */
  imageUrl: string | null;
  callToAction: string | null;
  /** The ad platform: source_system (src/lib/ad-platforms.ts), not the sales channel. */
  channel: string;
  /** NUMERIC, exact decimal text, in the reporting currency. */
  spend: string | null;
  impressions: bigint | null;
  clicks: bigint | null;
  conversions: number | null;
  /** Clicks over impressions, computed in SQL; null when there were no impressions. */
  ctr: number | null;
  revenue: number | null;
  roas: number | null;
  cpo: number | null;
  adUrl: string | null;
};

export type CreativesFilters = ReportFilters & {
  sort: CreativeSort;
  channel?: string | null;
  campaign?: string | null;
  names?: AdNameRule[];
  minimumSpend?: string | null;
  minimumConversions?: string | null;
  selection?: readonly CreativeIdentity[];
};
export type CreativesData = { creatives: Creative[]; truncated: boolean };

export async function getCreatives(filters: CreativesFilters): Promise<CreativesData> {
  const access = await requireViewer({ storeId: filters.storeId });
  if (
    filters.selection &&
    (filters.selection.length === 0 || parseCreativeSelection({ selection: JSON.stringify(filters.selection) }).error)
  )
    throw new Error("Invalid creative selection");
  return access.mode === "live" ? queryCreatives(filters) : sampleCreatives(filters);
}

export async function getCreativeChannels(filters: ReportFilters): Promise<string[]> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryCreativeChannels(filters) : sampleCreativeChannels(filters);
}

export async function getCreativeNames(filters: CreativesFilters): Promise<AdNameMatches> {
  const access = await requireViewer({ storeId: filters.storeId });
  return access.mode === "live" ? queryAdNameMatches(filters, true) : sampleCreativeNames(filters);
}
