import { choose } from "../../../e2e/helpers";
import { expect, test } from "@playwright/test";

test("performance: calendar grains and metric groups preserve the full business totals and scope", async ({ page }) => {
  await page.goto("/performance?store=sample-store-a&from=2026-09-02&to=2026-10-04");
  const table = page.getByRole("table", { name: "Revenue and orders", exact: true });
  const allScope = await page
    .getByRole("link", { name: "Compare period with last year", exact: true })
    .getAttribute("href");
  expect(new URL(allScope ?? "", "http://example.com").searchParams.get("sales_channel")).toBe("");
  await expect(table).toBeVisible();
  const total = table.locator("tfoot");
  const original = await total.locator("td").allTextContents();
  for (const grain of ["week", "month"]) {
    await choose(page, "Period", grain);
    await expect(page).toHaveURL(new RegExp(`grain=${grain}`));
    await expect(total.locator("td")).toHaveText(original);
  }
  await expect(table).toContainText("Sep 2, 2026");
  await choose(page, "Metrics", "efficiency");
  await expect(page.getByRole("table", { name: "Marketing efficiency", exact: true })).toBeVisible();
  await choose(page, "Metrics", "purchases");
  await expect(page.getByRole("table", { name: "New and repeat purchases", exact: true })).toBeVisible();
  await choose(page, "Sales channel", "Amazon");
  const comparison = page.getByRole("link", { name: "Compare period with last year", exact: true });
  await expect(comparison).toHaveAttribute("href", /sales_channel=Amazon/);
  await expect(comparison).toHaveAttribute("href", /compare=year/);
  await page.goto("/performance?store=sample-store-a&sales_channel=unknown");
  await expect(page.getByText("No business rows match this store, sales channel, and date range.")).toBeVisible();
  await page.getByRole("link", { name: "Show all sales channels", exact: true }).click();
  await expect(page.getByRole("table", { name: "Revenue and orders", exact: true })).toBeVisible();
});

test("performance: platform summary and individual platform tables share daily, weekly and monthly controls", async ({
  page,
}) => {
  await page.goto("/performance?store=sample-store-a&from=2026-09-02&to=2026-10-04&view=platforms");
  const combined = page.getByRole("table", { name: "Combined platforms", exact: true });
  await expect(combined).toBeVisible();
  await expect(page.getByRole("table", { name: "Platform comparison", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Meta", exact: true })).toHaveCount(0);
  const original = await combined.locator("tfoot td").allTextContents();
  for (const grain of ["week", "month", "day"]) {
    await choose(page, "Period", grain);
    await expect(page).toHaveURL(new RegExp(`grain=${grain}`));
    await expect(combined.locator("tfoot td")).toHaveText(original);
    await expect(page.getByLabel("Report", { exact: true })).toHaveValue("platforms");
  }
  await choose(page, "Platform detail", "Meta");
  await expect(page.getByRole("table", { name: "Meta", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Combined platforms", exact: true })).toHaveCount(0);
  await expect(page.getByText(/Combined revenue and conversions sum platform claims/)).toBeVisible();
  await page.setViewportSize({ width: 375, height: 812 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test("performance: multiple channels survive reload and CSV includes the full year and exact scope", async ({
  page,
  request,
}) => {
  await page.goto("/performance?store=sample-store-a&from=2025-01-01&to=2025-12-31&grain=month");
  const table = page.getByRole("table", { name: "Revenue and orders", exact: true });
  await expect(table).toBeVisible();
  const original = await table.locator("tfoot td").allTextContents();
  await page.getByText("Choose multiple channels", { exact: true }).click();
  await page.getByRole("checkbox", { name: "Online DTC", exact: true }).check();
  await page.getByRole("checkbox", { name: "Amazon", exact: true }).check();
  await page.getByRole("button", { name: "Apply channels", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("sales_channel") === '["Amazon","Online DTC"]');
  await page.reload();
  await expect(table.locator("tfoot td")).toHaveText(original);
  const href = await page.getByRole("link", { name: "Download business CSV", exact: true }).getAttribute("href");
  if (!href) throw new Error("Missing scoped export");
  const response = await request.get(href);
  expect(response.status()).toBe(200);
  const { parseCsv } = await import("../../../scripts/lib/reconciliation");
  const rows = parseCsv(await response.text());
  expect(rows.filter((row) => row.row_type === "period")).toHaveLength(12);
  expect(rows.filter((row) => row.row_type === "total")).toHaveLength(1);
  expect(
    rows.every(
      (row) => row.from === "2025-01-01" && row.to === "2025-12-31" && row.sales_channels === '["Amazon","Online DTC"]',
    ),
  ).toBe(true);
  await choose(page, "Sales channel", "Online DTC");
  await expect(table.locator("tfoot td")).not.toHaveText(original);
});
