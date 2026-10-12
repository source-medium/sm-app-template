import { expect, it } from "vitest";
import { allStoresHref, switchStoreHref } from "@/lib/store-navigation";

it("preserves dates and presentation while removing store-specific identities and searches", () => {
  const href = switchStoreHref(
    "/creatives",
    {
      store: "a",
      from: "2026-09-01",
      to: "2026-09-07",
      compare: "year",
      sort: "spend",
      campaign: "a-campaign",
      order: "a-order",
      cursor: "page2",
      q: "a-customer",
      name: "[retargeting]",
      acquisition_dimension: "campaign",
      acquisition_segment: "old-store-campaign",
      segment_search: "old-store-search",
      trend: "cumulative",
    },
    "b",
  );
  const params = new URL(href, "https://example.test").searchParams;
  expect(Object.fromEntries(params)).toEqual({
    store: "b",
    from: "2026-09-01",
    to: "2026-09-07",
    compare: "year",
    sort: "spend",
    name: "[retargeting]",
    acquisition_dimension: "campaign",
    trend: "cumulative",
  });
});
it("only carries a shared date reference and comparison into the portfolio", () => {
  expect(
    allStoresHref("/stores", {
      store: "a",
      from: "2026-09-01",
      to: "2026-09-07",
      compare: "off",
      campaign: "123",
      channel: "Meta",
    }),
  ).toBe("/stores?store=a&from=2026-09-01&to=2026-09-07&compare=off");
});
