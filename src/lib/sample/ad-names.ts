import type { AdNames } from "../ad-name-filters";

export const SAMPLE_CAMPAIGN_NAMES = {
  "cmp-1001": "Prospecting – Broad",
  "cmp-1002": "[retargeting] Site Visitors",
  "cmp-1003": "Advantage+ Shopping",
  "cmp-2001": "Brand Search",
  "cmp-2002": "Performance Max",
  "cmp-3001": "Spark Ads – Creators",
  "cmp-4001": "Pinterest Shopping",
} as const;

/** Explicit synthetic names let the sample demonstrate arbitrary literal naming rules. */
export function sampleAdNames(campaign: string, variant: number): AdNames {
  return {
    campaign: Object.entries(SAMPLE_CAMPAIGN_NAMES).find(([id]) => id === campaign)?.[1] ?? null,
    ad_group: variant === 0 ? "Core audience | 30d" : "Expansion | 90d",
    ad: variant === 0 ? "UGC | evergreen" : "Static | test",
  };
}
