import { expect, it } from "vitest";
import { creativesOptions, parseCreativeSelection, parseCreativeThreshold } from "./filters";
it("accepts fractional thresholds and rejects negative, malformed or excessive decimals", () => {
  expect(parseCreativeThreshold("0.25")).toBe("0.25");
  for (const value of ["-1", "1e3", "Infinity", "0.0000000001", "1' OR TRUE"])
    expect(parseCreativeThreshold(value)).toBeNull();
});
it("preserves compound identity and refuses duplicates and more than four selections", () => {
  const items = [
    ["Meta", "same"],
    ["Google", "same"],
  ];
  expect(parseCreativeSelection({ selection: JSON.stringify(items) })).toEqual({ items, error: null });
  for (const value of [[items[0], items[0]], [...items, ["Meta", "2"], ["Meta", "3"], ["Meta", "4"]], [["Meta"]]])
    expect(parseCreativeSelection({ selection: JSON.stringify(value) }).error).not.toBeNull();
});
it("reads an older platform key in the ad platform filter and a saved selection as its platform's key", () => {
  expect(creativesOptions({ channel: "facebook_ads" }).channel).toBe("meta_ads");
  expect(creativesOptions({ channel: "tiktok" }).channel).toBe("tiktok_ads");
  expect(creativesOptions({ channel: "snapchat_ads" }).channel).toBe("snapchat_ads");
  const saved = [
    ["facebook_ads", "crv-1"],
    ["meta_ads", "crv-1"],
    ["tiktok", "crv-2"],
  ];
  // Both Meta keys name one creative, so the selection keeps it once.
  expect(parseCreativeSelection({ selection: JSON.stringify(saved) })).toEqual({
    items: [
      ["meta_ads", "crv-1"],
      ["tiktok_ads", "crv-2"],
    ],
    error: null,
  });
});
it("flags a rejected threshold rather than dropping it silently, and bounds free text", () => {
  expect(creativesOptions({ min_spend: "-1" })).toMatchObject({ minimumSpend: null, thresholdError: true });
  expect(creativesOptions({ min_conversions: "2.5" })).toMatchObject({
    minimumConversions: "2.5",
    thresholdError: false,
  });
  expect(creativesOptions({})).toMatchObject({ view: "returns", sort: "spend", thresholdError: false });
  expect(creativesOptions({ campaign: "c".repeat(250) }).campaign).toHaveLength(200);
});
