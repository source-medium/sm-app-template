/**
 * Advertising platforms are `rpt_ad_performance_daily.source_system` values (meta_ads, google_ads, ...).
 * That relation's `sm_channel` is the sales channel an ad is credited to (online_dtc, amazon), not the
 * platform that delivered it. URLs, SQL and CSV exports keep the published value; reports show these names.
 */
const LABELS = new Map([
  ["meta_ads", "Meta"],
  ["facebook_ads", "Meta"],
  ["google_ads", "Google"],
  ["pinterest_ads", "Pinterest"],
  ["tiktok_ads", "TikTok"],
]);

/** A platform's display name; any other value, including `(unknown platform)`, shows as published. */
export function adPlatformLabel(value: string): string {
  return LABELS.get(value) ?? value;
}
