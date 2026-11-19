/**
 * Advertising platforms are `rpt_ad_performance_daily.source_system` values (meta_ads, google_ads, ...).
 * That relation's `sm_channel` is the sales channel an ad is credited to (online_dtc, amazon), not the
 * platform that delivered it. URLs, SQL and CSV exports keep the published value; reports show these names.
 *
 * Each mark is SourceMedium's connector mark for that platform, copied byte for byte into
 * public/platform-marks from the connector-assets-v1 contract (contracts/connector-assets-v1/icons.json
 * holds every mark's SHA-256).
 */
const PLATFORMS = new Map<string, { label: string; mark?: string }>([
  ["meta_ads", { label: "Meta", mark: "meta-integration.svg" }],
  ["facebook_ads", { label: "Meta", mark: "meta-integration.svg" }],
  ["google_ads", { label: "Google", mark: "google-ads-integration.svg" }],
  ["pinterest_ads", { label: "Pinterest", mark: "pinterest-integration.svg" }],
  ["tiktok_ads", { label: "TikTok", mark: "tiktok-integration.svg" }],
  ["tiktok", { label: "TikTok", mark: "tiktok-integration.svg" }],
  // Names from SourceMedium's connector catalog for keys published in its demo warehouse.
  ["amazon_ads", { label: "Amazon Ads", mark: "amazon-ads-integration.svg" }],
  ["bing_ads", { label: "Microsoft Ads", mark: "bing-integration.svg" }],
  ["applovin", { label: "AppLovin", mark: "applovin-integration.svg" }],
  ["impact", { label: "Impact Radius", mark: "impact-integration.svg" }],
  ["superfiliate", { label: "Superfiliate", mark: "superfiliate-integration.svg" }],
  ["shopmy", { label: "ShopMy", mark: "shopmy-integration.svg" }],
]);

/** A platform's display name; any other value, including `(unknown platform)`, shows as published. */
export function adPlatformLabel(value: string): string {
  return PLATFORMS.get(value)?.label ?? value;
}

/** The path of a platform's mark, or null for a value without one. */
export function adPlatformMark(value: string): string | null {
  const mark = PLATFORMS.get(value)?.mark;
  return mark ? `/platform-marks/${mark}` : null;
}
