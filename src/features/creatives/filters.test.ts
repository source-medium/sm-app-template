import { expect, it } from "vitest";
import { parseCreativeSelection, parseCreativeThreshold } from "./filters";
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
