/**
 * Advertising platforms are `rpt_ad_performance_daily.source_system` values (meta_ads, google_ads, ...).
 * That relation's `sm_channel` is the sales channel an ad is credited to (online_dtc, amazon), not the
 * platform that delivered it. URLs, SQL and CSV exports keep the published value, with an alias read as
 * its platform's key (AD_PLATFORM_ALIASES); reports show these names.
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

/**
 * Each other key a platform above is published under, with its first key: facebook_ads is meta_ads and
 * tiktok is tiktok_ads. Reports group, filter and link by the first key (AD_PLATFORM_SQL), so a store
 * that publishes both counts each campaign and creative once, as SourceMedium's Metabase dashboards do
 * by name.
 */
export const AD_PLATFORM_ALIASES: ReadonlyMap<string, string> = new Map(
  [...PLATFORMS].flatMap(([key, { label }]) => {
    const first = [...PLATFORMS].find(([, platform]) => platform.label === label)?.[0];
    return first && first !== key ? [[key, first] as const] : [];
  }),
);

/**
 * A platform key from outside the warehouse (a link, a saved view or comparison selection), as reports
 * group it: an older key reads as its platform's, so a link made before AD_PLATFORM_ALIASES returns the same
 * rows. Every parser of an ad platform parameter reads it through this.
 */
export function adPlatformKey(value: string): string {
  return AD_PLATFORM_ALIASES.get(value) ?? value;
}

/** A platform's display name; any other value, including `(unknown platform)`, shows as published. */
export function adPlatformLabel(value: string): string {
  return PLATFORMS.get(value)?.label ?? value;
}

/** The path of a platform's mark, or null for a value without one. */
export function adPlatformMark(value: string): string | null {
  const mark = PLATFORMS.get(value)?.mark;
  return mark ? `/platform-marks/${mark}` : null;
}
