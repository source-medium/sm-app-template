import { expect, test } from "@playwright/test";
import { expectTextContained, choose, expectNoSeriousA11yViolations } from "../../../e2e/helpers";
import { SAVED_REPORTS_KEY } from "@/lib/saved-reports";

for (const ranking of ["gainers", "decliners"]) {
  test(`products: ${ranking} takeaway uses the ranking's first comparison even with a retained second baseline`, async ({
    page,
  }) => {
    await page.goto(`/products?store=sample-store-a&from=2026-09-01&to=2026-09-07&ranking=${ranking}&baseline=b`);
    await expect(page.getByLabel("Report takeaway", { exact: true })).toContainText("vs previous 7 days");
    await expect(
      page.getByRole("table", { name: "Net revenue by product details", exact: true }).getByRole("columnheader").last(),
    ).toContainText("Change vs previous 7 days");
    await expect(page.getByRole("group", { name: "Comparison shown in charts and tables" })).toHaveCount(0);
  });
}

test("products: photo links preserve report scope and table identities stay pinned on phones", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(
    "/products?store=sample-store-a&range=last-7-days&sales_channel=online_dtc&dimension=variant&metric=units",
  );
  await expect(page.getByRole("button", { name: "More filters", exact: true })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  const takeaway = page.getByLabel("Report takeaway", { exact: true });
  await expect(takeaway).toContainText("Net units:");
  const before = await takeaway.innerText();
  await page.getByRole("group", { name: "Comparison shown in charts and tables" }).getByRole("button").nth(1).click();
  await expect(takeaway).not.toHaveText(before);
  const gallery = page.getByRole("region", { name: "Leading products", exact: true });
  const link = gallery.getByRole("link").first();
  const href = await link.getAttribute("href");
  const table = page.getByRole("table", { name: "Net units by variant details", exact: true });
  expect(href).toBe(await table.getByRole("link").first().getAttribute("href"));
  const scroller = page.getByRole("region", { name: "Net units by variant details", exact: true });
  const identity = table.locator("tbody tr").first().locator("td").first();
  const left = await identity.evaluate((node) => node.getBoundingClientRect().left);
  await scroller.evaluate((node) => {
    node.scrollLeft = node.scrollWidth;
  });
  await expect.poll(() => scroller.evaluate((node) => node.scrollLeft)).toBeGreaterThan(0);
  expect(Math.abs((await identity.evaluate((node) => node.getBoundingClientRect().left)) - left)).toBeLessThanOrEqual(
    1,
  );
  await link.locator("img").click();
  await expect(page).toHaveURL((url) => url.searchParams.has("entity"));
  const params = new URL(page.url()).searchParams;
  expect(params.get("range")).toBe("last-7-days");
  expect(params.get("sales_channel")).toBe("online_dtc");
  expect(params.get("dimension")).toBe("variant");
  expect(params.get("metric")).toBe("units");
});

test("products: browser-saved views restore rolling filters, survive reload and can be removed", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&range=last-7-days&metric=units&compare=year");
  // An edited date draft is not part of the applied view.
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Saved report views", exact: true });
  await dialog.getByLabel("View name", { exact: true }).fill("Weekly units");
  await dialog.getByRole("button", { name: "Save current view", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("View saved.");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), SAVED_REPORTS_KEY);
  const url = new URL(saved[0].href, page.url());
  expect(url.searchParams.get("range")).toBe("last-7-days");
  expect(url.searchParams.get("metric")).toBe("units");
  expect(url.searchParams.has("from")).toBe(false);
  expect(url.searchParams.has("to")).toBe(false);
  await page.keyboard.press("Escape");
  await page.reload();
  await choose(page, "Rank by", "revenue");
  await expect(page).toHaveURL((url) => url.searchParams.get("metric") === "revenue");
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  await dialog.getByRole("link", { name: /^Weekly units/ }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("metric") === "units" && url.searchParams.get("range") === "last-7-days",
  );
  await expect(page.getByLabel("Report takeaway")).toContainText("Net units:");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Saved views", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole("button", { name: "Remove Weekly units", exact: true }).click();
  await expect(dialog.getByText("No saved views yet.")).toBeVisible();
});

test("products: leading names and large values stay within their image strip", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-07");
  const gallery = page.getByRole("region", { name: "Leading products", exact: true });
  await gallery
    .locator("h2")
    .first()
    .evaluate((node) => {
      node.textContent = "A product with an unusually long name and an-unbroken-catalog-reference-12345678901234567890";
    });
  await gallery
    .locator("p.font-semibold")
    .first()
    .evaluate((node) => {
      node.textContent = "$12,345,678,901,234.56";
    });
  for (const width of [320, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectTextContained(gallery.locator("h2, p"));
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  }
});

test("products: catalog photos load and an image outage leaves totals and detail links usable", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-07");
  const gallery = page.getByRole("region", { name: "Leading products", exact: true });
  await gallery.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      gallery
        .locator("img")
        .first()
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  const totals = await page
    .getByRole("region", { name: "All product totals" })
    .locator('[data-slot="kpi-value"]')
    .allTextContents();
  let failedImages = 0;
  await page.route("**/sample-products/*", async (route) => {
    failedImages++;
    await route.abort();
  });
  await page.reload();
  await gallery.scrollIntoViewIfNeeded();
  await expect.poll(() => failedImages).toBeGreaterThan(0);
  await expect(gallery.locator("img")).toHaveCount(0);
  expect(
    await page.getByRole("region", { name: "All product totals" }).locator('[data-slot="kpi-value"]').allTextContents(),
  ).toEqual(totals);
  await expect(
    page.getByRole("table", { name: "Net revenue by product details", exact: true }).getByRole("link").first(),
  ).toBeVisible();
  await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
});

test("products: chart labels are readable while tooltips and tables retain product identity", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28");
  const chart = page.getByRole("img", { name: "Net revenue by product chart", exact: true });
  await expect(chart.getByText("Sample pack", { exact: true })).toBeVisible();
  await expect(chart).not.toContainText("shopify");
  await chart.locator(".recharts-bar-rectangle").first().hover();
  const tooltip = chart.locator('[data-slot="chart-tooltip"]');
  await expect(tooltip).toContainText("Sample pack (shopify / p12)");
  await page.getByRole("button", { name: "View as table", exact: true }).click();
  await expect(page.getByRole("table", { name: "Net revenue by product", exact: true })).toContainText(
    "Sample pack (shopify / p12)",
  );
  await expect(page.getByRole("button", { name: "View as table", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "View as chart", exact: true }).click();
  await expect(chart).toBeVisible();
});

test("products: diagnostics appear only for the relevant ranking", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28");
  const costs = page.getByRole("region", { name: "Product cost coverage", exact: true });
  const refunds = page.getByRole("region", { name: "Product refund rate", exact: true });
  await expect(page.getByRole("table", { name: "Net revenue by product details", exact: true })).toBeVisible();
  await expect(costs).toHaveCount(0);
  await expect(refunds).toHaveCount(0);
  await choose(page, "Rank by", "profit");
  await expect(costs).toContainText("lines with missing published cost");
  await expect(refunds).toHaveCount(0);
  await choose(page, "Rank by", "refunds");
  await expect(page.getByRole("table", { name: "Refund amount by product details", exact: true })).toBeVisible();
  await expect(costs).toHaveCount(0);
  await expect(refunds).toContainText("refunded units /");
  await choose(page, "Rank by", "refunded_units");
  await expect(page).toHaveURL(/metric=refunded_units/);
  await expect(page.getByRole("table", { name: "Refunded units by product details", exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "All product totals", exact: true }).locator('[data-slot="kpi-value"]'),
  ).toHaveCount(2);
  await expect(refunds).toBeVisible();
  await choose(page, "Rank by", "units");
  await expect(page.getByRole("table", { name: "Net units by product details", exact: true })).toBeVisible();
  await expect(costs).toHaveCount(0);
  await expect(refunds).toHaveCount(0);
});

test("products: ranking and variant filters preserve comparison dates and full totals", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-07&compare=year");
  const totals = page.getByRole("region", { name: "All product totals" });
  await expect(totals).toBeVisible();
  const before = await totals.locator('[data-slot="kpi-value"]').allTextContents();
  await choose(page, "Group by", "variant");
  await expect(page).toHaveURL(/dimension=variant/);
  await choose(page, "Rank by", "units");
  await expect(page).toHaveURL(/metric=units/);
  await expect(page.getByRole("table", { name: "Net units by variant details", exact: true })).toBeVisible();
  expect(await totals.locator('[data-slot="kpi-value"]').allTextContents()).toEqual(before);
  expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
  await expect(page.getByText("Showing the first 10 rows; more rows matched than this view loads.")).toBeVisible();
  await choose(page, "Compare with", "off");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/compare=off/);
  await expect(page.getByRole("columnheader", { name: "Change vs comparison" })).toHaveCount(0);
});

test("products: sales-channel scope changes totals and survives the other controls", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28&compare=year");
  const totals = page.getByRole("region", { name: "All product totals" }).locator('[data-slot="kpi-value"]');
  await expect(totals).toHaveCount(2);
  const all = await totals.allTextContents();
  await choose(page, "Sales channel", "amazon");
  await expect(page).toHaveURL(/sales_channel=amazon/);
  await expect(totals.first()).not.toHaveText(all[0] ?? "");
  await choose(page, "Group by", "variant");
  await expect(page).toHaveURL(/dimension=variant/);
  await choose(page, "Rank by", "profit");
  await expect(page).toHaveURL(/metric=profit/);
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("amazon");
  expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
  await page.goto("/products?store=sample-store-a&sales_channel=unknown");
  await expect(
    page.getByText("No valid-order product lines match this store, sales channel, and date range."),
  ).toBeVisible();
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("unknown");
  await choose(page, "Sales channel", "");
  await expect(totals).toHaveCount(2);
});
