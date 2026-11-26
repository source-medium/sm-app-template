import { describe, expect, it } from "vitest";
import { appConfig } from "@/app.config";
import { parseComparisonPlan } from "@/lib/comparison";
import { parseDateRange, rangePreset } from "@/lib/filters";
import type { SourceEvidence } from "@/lib/data/evidence";
import type { ReportMetadata } from "@/lib/data/report-metadata.server";
import { creativesOptions } from "@/features/creatives/filters";
import { paidMarketingOptions } from "@/features/paid-marketing/filters";
import { performanceOptions } from "@/features/performance/filters";
import { productOptions } from "@/features/products/queries";
import { PRESETS, PRESET_RELATIONS, offeredPresets, presetHref, presetReadiness, type Preset } from "./presets";

const TODAY = "2026-11-26";
const preset = (id: string): Preset => {
  const found = PRESETS.find((item) => item.id === id);
  if (!found) throw new Error(`No preset ${id}`);
  return found;
};

it("keeps the IDs the Metabase template's Start here list uses", () => {
  expect(PRESETS.map((item) => item.id).sort()).toEqual(
    [
      "weekly-review",
      "monthly-review",
      "channel-contribution",
      "operating-scorecard",
      "paid-efficiency",
      "creative-spend",
      "creative-formats",
      "product-gainers",
      "product-profit",
      "refund-concentration",
      "cohort-health",
      "geography-mix",
      "store-portfolio",
    ].sort(),
  );
  expect(PRESET_RELATIONS.length).toBeLessThanOrEqual(12);
});

describe("each preset opens its destination with values the destination applies", () => {
  for (const item of PRESETS) {
    it(item.id, () => {
      expect(appConfig.nav.map((nav) => nav.href)).toContain(item.route);
      const params = { ...item.params };
      if (params.range) {
        const range = parseDateRange(params, TODAY);
        expect(rangePreset(params, range)?.value).toBe(params.range);
        const plan = parseComparisonPlan(params, range, TODAY);
        if (params.compare) expect(plan.slots[0].mode).toBe(params.compare);
        if (params.compare2) expect(plan.slots[1].mode).toBe(params.compare2);
      }
      const applied: Record<string, string> = {
        ...(item.route === "/products" ? productOptions(params) : {}),
        ...(item.route === "/paid-marketing" ? paidMarketingOptions(params) : {}),
        ...(item.route === "/performance" ? performanceOptions(params) : {}),
        ...(item.route === "/creatives" ? creativesOptions(params) : {}),
      } as Record<string, string>;
      for (const key of ["metric", "ranking", "breakdown", "view", "sort"])
        if (params[key]) expect(applied[key], key).toBe(params[key]);
    });
  }
});

it("links with the current store and opens at the preset's section", () => {
  expect(presetHref(preset("product-gainers"), "store-a")).toBe(
    "/products?store=store-a&metric=revenue&ranking=gainers",
  );
  expect(presetHref(preset("channel-contribution"), "store-a")).toBe(
    "/overview?store=store-a&range=last-28-days#channel-breakdown",
  );
  expect(presetHref(preset("cohort-health"), "store-a")).toBe("/retention?store=store-a");
});

it("offers a store comparison only with several stores, and nothing for a removed view", () => {
  const routes = appConfig.nav.map((item) => item.href);
  const ids = (storeCount: number | null, list = routes) =>
    offeredPresets(PRESETS, { routes: list, storeCount }).map((item) => item.id);
  expect(ids(1)).not.toContain("store-portfolio");
  expect(ids(2)).toContain("store-portfolio");
  // An unknown count shows it, as the sidebar shows All stores.
  expect(ids(null)).toContain("store-portfolio");
  expect(
    ids(
      2,
      routes.filter((route) => route !== "/products"),
    ),
  ).not.toContain("product-gainers");
  expect(ids(1)).toHaveLength(PRESETS.length - 1);
});

describe("readiness", () => {
  const source = (relation: string, overrides: Partial<SourceEvidence> = {}): SourceEvidence => ({
    dataset: "sm_transformed_v2",
    relation,
    scope: "store",
    metadata: "accessible",
    consistency: "consistent",
    observedDate: "2026-11-25",
    hasData: true,
    freshness: "unknown",
    completeness: "unknown",
    quality: "unknown",
    ...overrides,
  });
  const live = (sources: SourceEvidence[]): ReportMetadata => ({
    mode: "live",
    metrics: [],
    catalog: "accessible",
    sources,
    truncated: false,
  });
  const all = (overrides: Record<string, Partial<SourceEvidence>> = {}) =>
    live(PRESET_RELATIONS.map((relation) => source(relation, overrides[relation])));

  it("is ready on sample data and when every source has rows for the store", () => {
    const sample: ReportMetadata = { mode: "sample", metrics: [], catalog: "unknown", sources: [], truncated: false };
    for (const item of PRESETS) {
      expect(presetReadiness(item, sample)).toEqual({ state: "ready" });
      expect(presetReadiness(item, all())).toEqual({ state: "ready" });
    }
  });

  it("names the missing source and its fix when a required source has no rows", () => {
    const readiness = presetReadiness(preset("paid-efficiency"), all({ rpt_ad_performance_daily: { hasData: false } }));
    expect(readiness).toEqual({
      state: "unavailable",
      reason:
        "SourceMedium has published no ad performance for this store. Connect or check its source in SourceMedium.",
    });
    // Other questions do not depend on it.
    expect(presetReadiness(preset("weekly-review"), all({ rpt_ad_performance_daily: { hasData: false } }))).toEqual({
      state: "ready",
    });
  });

  it("is limited, saying what is missing, when only a source that adds detail has no rows", () => {
    expect(presetReadiness(preset("creative-spend"), all({ rpt_ad_creative_assets: { hasData: false } }))).toEqual({
      state: "limited",
      reason: "Creative images and text are not published for this store.",
    });
  });

  it("says availability is unknown rather than guessing", () => {
    const item = preset("cohort-health");
    const cohorts = "rpt_cohort_ltv_by_first_valid_purchase_attribute_no_product_filters";
    expect(presetReadiness(item, all({ [cohorts]: { metadata: "denied", hasData: null } }))).toEqual({
      state: "unknown",
      reason: "The data dictionary cannot be read with this connection.",
    });
    expect(
      presetReadiness(item, all({ [cohorts]: { scope: "unknown", consistency: "unknown", hasData: null } })),
    ).toEqual({ state: "unknown", reason: "Availability of customer cohorts for this store is not published." });
    expect(presetReadiness(item, all({ [cohorts]: { consistency: "inconsistent", hasData: null } }))).toMatchObject({
      state: "unknown",
    });
    expect(presetReadiness(item, live([]))).toMatchObject({ state: "unknown" });
  });
});
