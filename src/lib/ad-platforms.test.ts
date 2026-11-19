import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, it } from "vitest";
import { adPlatformLabel, adPlatformMark } from "./ad-platforms";

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
