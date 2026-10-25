import { expect, test } from "@playwright/test";
import { expectTextContained } from "../../../e2e/helpers";

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
  await page.getByLabel("Rank by", { exact: true }).selectOption("profit");
  await expect(costs).toContainText("lines with missing published cost");
  await expect(refunds).toHaveCount(0);
  await page.getByLabel("Rank by", { exact: true }).selectOption("refunds");
  await expect(page.getByRole("table", { name: "Refund amount by product details", exact: true })).toBeVisible();
  await expect(costs).toHaveCount(0);
  await expect(refunds).toContainText("refunded units /");
  await page.getByLabel("Rank by", { exact: true }).selectOption("refunded_units");
  await expect(page).toHaveURL(/metric=refunded_units/);
  await expect(page.getByRole("table", { name: "Refunded units by product details", exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "All product totals", exact: true }).locator('[data-slot="kpi-value"]'),
  ).toHaveCount(2);
  await expect(refunds).toBeVisible();
  await page.getByLabel("Rank by", { exact: true }).selectOption("units");
  await expect(page.getByRole("table", { name: "Net units by product details", exact: true })).toBeVisible();
  await expect(costs).toHaveCount(0);
  await expect(refunds).toHaveCount(0);
});

test("products: ranking and variant filters preserve comparison dates and full totals", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-07&compare=year");
  const totals = page.getByRole("region", { name: "All product totals" });
  await expect(totals).toBeVisible();
  const before = await totals.locator('[data-slot="kpi-value"]').allTextContents();
  await page.getByLabel("Group by", { exact: true }).selectOption("variant");
  await expect(page).toHaveURL(/dimension=variant/);
  await page.getByLabel("Rank by", { exact: true }).selectOption("units");
  await expect(page).toHaveURL(/metric=units/);
  await expect(page.getByRole("table", { name: "Net units by variant details", exact: true })).toBeVisible();
  expect(await totals.locator('[data-slot="kpi-value"]').allTextContents()).toEqual(before);
  expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
  await expect(page.getByText("Showing the first 10 rows; more rows matched than this view loads.")).toBeVisible();
  await page.getByLabel("Compare with").selectOption("off");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/compare=off/);
  await expect(page.getByRole("columnheader", { name: "Change vs comparison" })).toHaveCount(0);
});

test("products: sales-channel scope changes totals and survives the other controls", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28&compare=year");
  const totals = page.getByRole("region", { name: "All product totals" }).locator('[data-slot="kpi-value"]');
  await expect(totals).toHaveCount(2);
  const all = await totals.allTextContents();
  await page.getByLabel("Sales channel", { exact: true }).selectOption("amazon");
  await expect(page).toHaveURL(/sales_channel=amazon/);
  await expect(totals.first()).not.toHaveText(all[0] ?? "");
  await page.getByLabel("Group by", { exact: true }).selectOption("variant");
  await expect(page).toHaveURL(/dimension=variant/);
  await page.getByLabel("Rank by", { exact: true }).selectOption("profit");
  await expect(page).toHaveURL(/metric=profit/);
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("amazon");
  expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
  await page.goto("/products?store=sample-store-a&sales_channel=unknown");
  await expect(
    page.getByText("No valid-order product lines match this store, sales channel, and date range."),
  ).toBeVisible();
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("unknown");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("");
  await expect(totals).toHaveCount(2);
});
