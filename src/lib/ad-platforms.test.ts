import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { AD_PLATFORM_SQL } from "./data/channel-sql";
import { AD_PLATFORM_ALIASES, adPlatformKey, adPlatformLabel, adPlatformMark } from "./ad-platforms";
import { parseAdPlatform } from "./filters";

it("names published ad platforms and shows any other value as published", () => {
  expect(["meta_ads", "facebook_ads", "google_ads", "pinterest_ads", "tiktok_ads"].map(adPlatformLabel)).toEqual([
    "Meta",
    "Meta",
    "Google",
    "Pinterest",
    "TikTok",
  ]);
  for (const value of ["snapchat_ads", "(unknown platform)", "online_dtc", "constructor", "toString"]) {
    expect(adPlatformLabel(value)).toBe(value);
    expect(adPlatformMark(value)).toBeNull();
  }
});

it("reads a platform's other published key as its first one, as Metabase merges them by name", () => {
  expect([...AD_PLATFORM_ALIASES]).toEqual([
    ["facebook_ads", "meta_ads"],
    ["tiktok", "tiktok_ads"],
  ]);
  for (const [alias, key] of AD_PLATFORM_ALIASES) {
    expect(adPlatformLabel(alias)).toBe(adPlatformLabel(key));
    expect(adPlatformKey(alias)).toBe(key);
  }
  for (const value of ["meta_ads", "snapchat_ads", "", "constructor"]) expect(adPlatformKey(value)).toBe(value);
  expect(AD_PLATFORM_SQL).toBe(
    "CASE source_system WHEN 'facebook_ads' THEN 'meta_ads' WHEN 'tiktok' THEN 'tiktok_ads' ELSE COALESCE(source_system, '(unknown platform)') END",
  );
});

it("draws each mark from the connector-assets contract, byte for byte, and ships no other", () => {
  const manifest = JSON.parse(readFileSync("contracts/connector-assets-v1/icons.json", "utf8")) as {
    icons: Record<string, string>;
  };
  const shipped = readdirSync("public/platform-marks").sort();
  const used = [
    ...new Set(
      [
        "meta_ads",
        "google_ads",
        "pinterest_ads",
        "tiktok_ads",
        "amazon_ads",
        "bing_ads",
        "applovin",
        "impact",
        "superfiliate",
        "shopmy",
      ].map((value) => adPlatformMark(value)?.replace("/platform-marks/", "")),
    ),
  ].sort();
  expect(shipped).toEqual(used);
  for (const file of shipped) {
    const digest = createHash("sha256")
      .update(readFileSync(join("public/platform-marks", file)))
      .digest("hex");
    expect(digest, file).toBe(manifest.icons[file]);
  }
});

it("reads every ad platform parameter through one bound and the alias map", () => {
  expect(parseAdPlatform({ channel: "facebook_ads" }, "channel")).toBe("meta_ads");
  expect(parseAdPlatform({ view: "assets", channel: ["tiktok", "meta_ads"] }, "channel")).toBe("tiktok_ads");
  expect(parseAdPlatform({}, "channel")).toBeNull();
  expect(parseAdPlatform({ channel: "x".repeat(150) }, "channel")).toHaveLength(100);
});
