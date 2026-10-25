import { expect, it } from "vitest";
import { adPlatformLabel } from "./ad-platforms";

it("names published ad platforms and shows any other value as published", () => {
  expect(["meta_ads", "facebook_ads", "google_ads", "pinterest_ads", "tiktok_ads"].map(adPlatformLabel)).toEqual([
    "Meta",
    "Meta",
    "Google",
    "Pinterest",
    "TikTok",
  ]);
  for (const value of ["snapchat_ads", "(unknown platform)", "online_dtc", "constructor", "toString"])
    expect(adPlatformLabel(value)).toBe(value);
});
