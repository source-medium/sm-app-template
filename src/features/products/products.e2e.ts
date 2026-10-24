import { expect, test } from "@playwright/test";
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
  await page.getByLabel("Sales channel", { exact: true }).selectOption("Amazon");
  await expect(page).toHaveURL(/sales_channel=Amazon/);
  await expect(totals.first()).not.toHaveText(all[0] ?? "");
  await page.getByLabel("Group by", { exact: true }).selectOption("variant");
  await expect(page).toHaveURL(/dimension=variant/);
  await page.getByLabel("Rank by", { exact: true }).selectOption("profit");
  await expect(page).toHaveURL(/metric=profit/);
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("Amazon");
  expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
  await page.goto("/products?store=sample-store-a&sales_channel=unknown");
  await expect(
    page.getByText("No valid-order product lines match this store, sales channel, and date range."),
  ).toBeVisible();
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("unknown");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("");
  await expect(totals).toHaveCount(2);
});
