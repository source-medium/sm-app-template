import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { WarehouseError } from "@/lib/data/warehouse-error";
import type { Creative, CreativeMeasures, CreativesData } from "./queries";
import {
  ResolvedSelectionBar,
  SelectionBar,
  creativeTitle,
  findSelectedCreative,
  hasMissingSelection,
  matchesCreative,
  needsSelectionLookup,
  resolveSelectedCreatives,
} from "./selection-bar";

const ZERO: CreativeMeasures = {
  spend: "100",
  impressions: 1000n,
  clicks: 25n,
  conversions: 4,
  revenue: 300,
  roas: 3,
  cpo: 25,
  ctr: 0.025,
};

function makeCreative(overrides: Partial<Creative> = {}): Creative {
  return {
    ...ZERO,
    creativeId: "crv-1",
    assets: "available",
    title: "Evergreen tote",
    body: "Body copy",
    name: "Fallback name",
    imageUrl: "https://cdn.example.com/crv-1.jpg",
    imageFallbackUrl: null,
    media: [{ kind: "image", src: "https://cdn.example.com/crv-1.jpg" }],
    callToAction: "SHOP_NOW",
    channel: "meta_ads",
    format: "image",
    firstSpend: { when: "running", date: "2026-08-10" },
    baselines: [ZERO, ZERO],
    adUrl: null,
    ...overrides,
  };
}

const COVERAGE = { latest_date: "2026-09-28", previous_latest_date: null, second_latest_date: null };

describe("findSelectedCreative", () => {
  const offPage = makeCreative({ creativeId: "crv-9", title: "Off page" });
  const onPage = makeCreative({ creativeId: "crv-1", title: "On page" });

  it("names a pick from the ranking without querying the selection", async () => {
    const loadSelected = vi.fn<() => Promise<CreativesData>>();
    const data = { creatives: [onPage], truncated: true, coverage: COVERAGE };
    await expect(findSelectedCreative(data, ["meta_ads", "crv-1"], loadSelected)).resolves.toBe(onPage);
    expect(loadSelected).not.toHaveBeenCalled();
  });

  it("queries the selection only when a truncated ranking misses the pick", async () => {
    const loadSelected = vi
      .fn<() => Promise<CreativesData>>()
      .mockResolvedValue({ creatives: [offPage], truncated: false, coverage: COVERAGE });
    const complete = { creatives: [onPage], truncated: false, coverage: COVERAGE };
    const truncated = { ...complete, truncated: true };

    expect(needsSelectionLookup(complete, [["meta_ads", "crv-9"]])).toBe(false);
    await expect(findSelectedCreative(complete, ["meta_ads", "crv-9"], loadSelected)).resolves.toBeUndefined();
    expect(loadSelected).not.toHaveBeenCalled();

    expect(needsSelectionLookup(truncated, [["meta_ads", "crv-9"]])).toBe(true);
    await expect(findSelectedCreative(truncated, ["meta_ads", "crv-9"], loadSelected)).resolves.toBe(offPage);
    expect(loadSelected).toHaveBeenCalledTimes(1);
  });

  it("falls back to no creative on a warehouse error and rethrows anything else", async () => {
    const truncated = { creatives: [onPage], truncated: true, coverage: COVERAGE };
    const warehouse = vi.fn<() => Promise<CreativesData>>().mockRejectedValue(new WarehouseError("transient"));
    await expect(findSelectedCreative(truncated, ["meta_ads", "crv-9"], warehouse)).resolves.toBeUndefined();
    const bug = vi.fn<() => Promise<CreativesData>>().mockRejectedValue(new TypeError("bug"));
    await expect(findSelectedCreative(truncated, ["meta_ads", "crv-9"], bug)).rejects.toThrow(TypeError);
  });
});

describe("resolveSelectedCreatives", () => {
  it("slices directly from loadList without calling the source loader when the list is not truncated", async () => {
    const onPage = makeCreative({ creativeId: "crv-1", title: "On page" });
    const other = makeCreative({ creativeId: "crv-2", title: "Other" });
    const loadList = vi.fn<() => Promise<CreativesData>>().mockResolvedValue({
      creatives: [onPage, other],
      truncated: false,
      coverage: COVERAGE,
    });
    const loadFromSource = vi.fn<() => Promise<CreativesData>>();

    const result = await resolveSelectedCreatives(
      [
        ["meta_ads", "crv-1"],
        ["meta_ads", "missing-from-scope"],
      ],
      loadList,
      loadFromSource,
    );

    expect(loadList).toHaveBeenCalledTimes(1);
    expect(loadFromSource).not.toHaveBeenCalled();
    expect(result).toEqual({ creatives: [onPage], truncated: false, coverage: COVERAGE });
  });

  it("slices directly when the list is truncated but every selected creative is already on the page", async () => {
    const first = makeCreative({ creativeId: "crv-1" });
    const second = makeCreative({ creativeId: "crv-2", channel: "tiktok_ads" });
    const loadList = vi.fn<() => Promise<CreativesData>>().mockResolvedValue({
      creatives: [first, second],
      truncated: true,
      coverage: COVERAGE,
    });
    const loadFromSource = vi.fn<() => Promise<CreativesData>>();

    const result = await resolveSelectedCreatives(
      [
        ["meta_ads", "crv-1"],
        ["tiktok_ads", "crv-2"],
      ],
      loadList,
      loadFromSource,
    );

    expect(loadList).toHaveBeenCalledTimes(1);
    expect(loadFromSource).not.toHaveBeenCalled();
    expect(result).toEqual({ creatives: [first, second], truncated: false, coverage: COVERAGE });
  });

  it("queries the source loader only when the list is truncated and a selected creative is off-page", async () => {
    const onPage = makeCreative({ creativeId: "crv-1", title: "On page" });
    const offPage = makeCreative({
      creativeId: "crv-99",
      title: "Off-page winner",
      imageUrl: "https://cdn.example.com/off-page.jpg",
    });
    const loadList = vi.fn<() => Promise<CreativesData>>().mockResolvedValue({
      creatives: [onPage],
      truncated: true,
      coverage: COVERAGE,
    });
    const loadFromSource = vi.fn<() => Promise<CreativesData>>().mockResolvedValue({
      creatives: [onPage, offPage],
      truncated: false,
      coverage: COVERAGE,
    });

    const result = await resolveSelectedCreatives(
      [
        ["meta_ads", "crv-1"],
        ["meta_ads", "crv-99"],
      ],
      loadList,
      loadFromSource,
    );

    expect(loadList).toHaveBeenCalledTimes(1);
    expect(loadFromSource).toHaveBeenCalledTimes(1);
    expect(result.creatives).toEqual([onPage, offPage]);
  });

  it("returns empty without calling loaders when selection is empty", async () => {
    const loadList = vi.fn<() => Promise<CreativesData>>();
    const loadFromSource = vi.fn<() => Promise<CreativesData>>();

    const result = await resolveSelectedCreatives([], loadList, loadFromSource);

    expect(result).toEqual({ creatives: [], truncated: false, coverage: null });
    expect(loadList).not.toHaveBeenCalled();
    expect(loadFromSource).not.toHaveBeenCalled();
  });

  it("returns null coverage when no selected creative matches in an untruncated list", async () => {
    const other = makeCreative({ creativeId: "crv-other" });
    const loadList = vi.fn<() => Promise<CreativesData>>().mockResolvedValue({
      creatives: [other],
      truncated: false,
      coverage: COVERAGE,
    });
    const loadFromSource = vi.fn<() => Promise<CreativesData>>();

    const result = await resolveSelectedCreatives([["meta_ads", "crv-missing"]], loadList, loadFromSource);

    expect(loadList).toHaveBeenCalledTimes(1);
    expect(loadFromSource).not.toHaveBeenCalled();
    expect(result).toEqual({ creatives: [], truncated: false, coverage: null });
  });

  it("falls back to the source loader when loadList rejects with a WarehouseError", async () => {
    const picked = makeCreative({ creativeId: "crv-99", title: "Independent comparison pick" });
    const loadList = vi.fn<() => Promise<CreativesData>>().mockRejectedValue(new WarehouseError("deadline_exceeded"));
    const loadFromSource = vi.fn<() => Promise<CreativesData>>().mockResolvedValue({
      creatives: [picked],
      truncated: false,
      coverage: COVERAGE,
    });

    const result = await resolveSelectedCreatives([["meta_ads", "crv-99"]], loadList, loadFromSource);

    expect(loadList).toHaveBeenCalledTimes(1);
    expect(loadFromSource).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ creatives: [picked], truncated: false, coverage: COVERAGE });
  });

  it("rethrows non-warehouse errors from loadList without calling the source loader", async () => {
    const loadList = vi.fn<() => Promise<CreativesData>>().mockRejectedValue(new Error("Viewer denied"));
    const loadFromSource = vi.fn<() => Promise<CreativesData>>();

    await expect(resolveSelectedCreatives([["meta_ads", "crv-1"]], loadList, loadFromSource)).rejects.toThrow(
      "Viewer denied",
    );
    expect(loadFromSource).not.toHaveBeenCalled();
  });

  it("propagates errors when the source fallback loader rejects", async () => {
    const loadList = vi.fn<() => Promise<CreativesData>>().mockRejectedValue(new WarehouseError("transient"));
    const sourceError = new WarehouseError("deadline_exceeded");
    const loadFromSource = vi.fn<() => Promise<CreativesData>>().mockRejectedValue(sourceError);

    await expect(resolveSelectedCreatives([["meta_ads", "crv-99"]], loadList, loadFromSource)).rejects.toBe(
      sourceError,
    );
    expect(loadList).toHaveBeenCalledTimes(1);
    expect(loadFromSource).toHaveBeenCalledTimes(1);
  });
});

describe("SelectionBar and ResolvedSelectionBar", () => {
  it("retains off-page creative titles and thumbnails once resolved", async () => {
    const onPage = makeCreative({ creativeId: "crv-1", title: "On-page tote" });
    const offPage = makeCreative({
      creativeId: "crv-99",
      title: "Off-page video ad",
      format: "video",
      imageUrl: "https://cdn.example.com/off-page.jpg",
      firstSpend: { when: "launched", date: "2026-09-20" },
    });
    const element = await ResolvedSelectionBar({
      selection: [
        ["meta_ads", "crv-1"],
        ["meta_ads", "crv-99"],
      ],
      creatives: [onPage],
      loadSelected: async () => ({ creatives: [onPage, offPage], truncated: false, coverage: COVERAGE }),
    });
    render(element);

    const bar = screen.getByRole("complementary", { name: "Your comparison" });
    expect(within(bar).getByText("2 creatives selected")).toBeVisible();
    expect(within(bar).getByText("On-page tote")).toBeVisible();
    expect(within(bar).getByText("Off-page video ad")).toBeVisible();
    const images = bar.querySelectorAll("img");
    expect([...images].map((img) => img.getAttribute("src"))).toEqual([
      "https://cdn.example.com/crv-1.jpg",
      "https://cdn.example.com/off-page.jpg",
    ]);
  });

  it("falls back to visible creatives if loadSelected fails with a WarehouseError", async () => {
    const onPage = makeCreative({ creativeId: "crv-1", title: "On-page tote" });
    const element = await ResolvedSelectionBar({
      selection: [
        ["meta_ads", "crv-1"],
        ["meta_ads", "crv-99"],
      ],
      creatives: [onPage],
      loadSelected: async () => {
        throw new WarehouseError("transient");
      },
    });
    render(element);

    const bar = screen.getByRole("complementary", { name: "Your comparison" });
    expect(within(bar).getByText("On-page tote")).toBeVisible();
    expect(within(bar).getByText("crv-99")).toBeVisible();
  });

  it("disambiguates identically titled creatives on the same platform by format, date and id", () => {
    const a = makeCreative({ creativeId: "crv-a", title: "Holiday sale", format: "video" });
    const b = makeCreative({ creativeId: "crv-b", title: "Holiday sale", format: "image" });
    render(
      <SelectionBar
        selection={[
          ["meta_ads", "crv-a"],
          ["meta_ads", "crv-b"],
        ]}
        creatives={[a, b]}
      />,
    );
    expect(screen.getByText("Meta · Video")).toBeVisible();
    expect(screen.getByText("Meta · Image")).toBeVisible();
  });
});

describe("selection helpers", () => {
  it("matches creatives by platform and ID, detects missing selections and formats fallback titles", () => {
    const meta = makeCreative({ channel: "meta_ads", creativeId: "shared" });
    const google = makeCreative({ channel: "google_ads", creativeId: "shared" });
    expect(matchesCreative(meta, ["meta_ads", "shared"])).toBe(true);
    expect(matchesCreative(meta, ["google_ads", "shared"])).toBe(false);
    expect(hasMissingSelection([["meta_ads", "shared"]], [meta, google])).toBe(false);
    expect(
      hasMissingSelection(
        [
          ["meta_ads", "shared"],
          ["tiktok_ads", "shared"],
        ],
        [meta, google],
      ),
    ).toBe(true);
    expect(creativeTitle(makeCreative({ title: null, name: "Named creative" }))).toBe("Named creative");
    expect(creativeTitle(makeCreative({ title: null, name: null, body: "Body fallback" }))).toBe("Body fallback");
    expect(creativeTitle(makeCreative({ title: null, name: null, body: null, creativeId: "c-42" }))).toBe(
      "Creative c-42",
    );
  });
});
