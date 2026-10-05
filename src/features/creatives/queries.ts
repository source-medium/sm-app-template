/**
 * Creatives' data contract: rpt_ad_performance_daily aggregated to one row
 * per ad creative over the range, sorted by a measure. Creative text and
 * image URLs are populated for Meta today; other platforms render as text
 * cards.
 */
import "server-only";
import { requireViewer } from "@/lib/auth/require-viewer";
import type { ReportFilters } from "@/lib/filters";
import { queryCreatives } from "./bigquery";
import { sampleCreatives } from "./sample";

export const CREATIVE_SORTS = ["spend", "impressions", "clicks", "conversions", "ctr"] as const;
export type CreativeSort = (typeof CREATIVE_SORTS)[number];

export type Creative = {
  creativeId: string;
  title: string | null;
  body: string | null;
  /** Hotlinked from the ad platform; it may expire. The card falls back to text. */
  imageUrl: string | null;
  callToAction: string | null;
  channel: string | null;
  /** NUMERIC, exact decimal text, in the reporting currency. */
  spend: string | null;
  impressions: bigint | null;
  clicks: bigint | null;
  conversions: number | null;
  /** Clicks over impressions, computed in SQL; null when there were no impressions. */
  ctr: number | null;
};

export type CreativesFilters = ReportFilters & { sort: CreativeSort };
export type CreativesData = { creatives: Creative[]; truncated: boolean };

export async function getCreatives(filters: CreativesFilters): Promise<CreativesData> {
  const access = await requireViewer();
  return access.mode === "live" ? queryCreatives(filters) : sampleCreatives(filters);
}
