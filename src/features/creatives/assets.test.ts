import { expect, it } from "vitest";
import { assetHref, reportHref } from "./assets";

const query = (href: string) => Object.fromEntries(new URL(href, "https://app.test").searchParams);

it("returns from the assets to Creative performance with its layout, platform and filters", () => {
  const report = { store: "s1", view: "table", channel: "google_ads", sort: "clicks", start: "2026-11-01" };
  const assets = query(assetHref(report, "meta_ads", "c1"));
  expect(assets).toMatchObject({
    view: "assets",
    channel: "meta_ads",
    entity: "c1",
    report_view: "table",
    report_channel: "google_ads",
    sort: "clicks",
  });
  expect(query(reportHref(assets))).toEqual(report);
  // All creative assets clears the creative and platform but keeps the report's to return to.
  const all = query(assetHref(assets));
  expect(all).toMatchObject({ view: "assets", report_view: "table", report_channel: "google_ads" });
  expect(all.entity).toBeUndefined();
  expect(all.channel).toBeUndefined();
  expect(query(reportHref(all))).toEqual(report);
});

it("returns to all platforms when the report had none, whichever creative's assets were opened", () => {
  const selection = JSON.stringify([
    ["meta_ads", "c1"],
    ["google_ads", "c2"],
  ]);
  const report = { store: "s1", selection };
  const assets = query(assetHref(report, "meta_ads", "c1"));
  expect(assets.channel).toBe("meta_ads");
  expect(query(reportHref(assets))).toEqual(report);
});

it("returns to the default layout when the kept layout is not one of the report's", () => {
  expect(query(reportHref({ store: "s1", view: "assets", report_view: "assets" }))).toEqual({ store: "s1" });
  expect(query(reportHref(query(assetHref({ store: "s1" }))))).toEqual({ store: "s1" });
});
