import { expect, it } from "vitest";
import { assetHref, reportHref } from "./assets";

const query = (href: string) => Object.fromEntries(new URL(href, "https://app.test").searchParams);

it("returns from the assets to Creative performance with its layout and filters", () => {
  const report = { store: "s1", view: "table", sort: "clicks", start: "2026-11-01" };
  const assets = query(assetHref(report, "meta_ads", "c1"));
  expect(assets).toMatchObject({
    view: "assets",
    report_view: "table",
    channel: "meta_ads",
    entity: "c1",
    sort: "clicks",
  });
  expect(query(reportHref(assets))).toEqual({ ...report, channel: "meta_ads" });
  // All creative assets clears the creative and platform but keeps the layout to return to.
  const all = query(assetHref(assets));
  expect(all).toMatchObject({ view: "assets", report_view: "table" });
  expect(all.entity).toBeUndefined();
  expect(query(reportHref(all))).toEqual(report);
});

it("returns to the default layout when the report had none", () => {
  const back = query(reportHref(query(assetHref({ store: "s1" }))));
  expect(back).toEqual({ store: "s1" });
});
