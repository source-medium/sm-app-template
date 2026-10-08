/**
 * Live checks against your own warehouse (`pnpm test:live`, with your
 * configuration in environment settings or .env.local). Every page must render live data with no
 * error state. These run real BigQuery queries, so they are opt-in.
 */
import { expect, test } from "@playwright/test";
import { appConfig } from "../app.config";
import { watchConsole } from "./helpers";

for (const item of appConfig.nav) {
  test(`${item.href} renders live data without errors`, async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto(item.href);
    await expect(page.getByTestId("mode-chip")).toHaveText("Live data");
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
    // The app's error states; Next's own route announcer also has role="alert".
    await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
    await expect(page.getByText("Queried at").first()).toBeVisible();
    expect(problems).toEqual([]);
  });
}

test("Overview summaries and exports work at each grain with a sales-channel filter", async ({ page, request }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/overview"), "no Overview view");
  const problems = watchConsole(page);
  await page.goto("/overview");
  const channel = page.getByLabel("Sales channel", { exact: true });
  await expect(channel).toBeVisible({ timeout: 30_000 });
  const value = await channel.locator('option:not([value=""])').first().getAttribute("value");
  if (value) {
    await channel.selectOption(value);
    await expect(page).toHaveURL(/sales_channel=/);
  }
  for (const grain of ["week", "month"]) {
    await page.getByLabel("Summary rows", { exact: true }).selectOption(grain);
    await expect(page).toHaveURL(new RegExp(`grain=${grain}`));
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Business summary", exact: true })).toBeVisible();
    const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
    if (!href) throw new Error("Missing summary download");
    const response = await request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect((await response.text()).split("\r\n")[0]).toContain('"row_type","period_from","period_to"');
  }
  expect(problems).toEqual([]);
});

test("Paid marketing can rank campaigns against the previous year", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/paid-marketing"), "no Paid marketing view");
  const problems = watchConsole(page);
  await page.goto("/paid-marketing?breakdown=campaign&compare=year");
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Spend by campaign details", exact: true })).toBeVisible();
  expect(problems).toEqual([]);
});

test("Products variants and published retention cohorts have usable live data", async ({ page }) => {
  if (appConfig.nav.some((item) => item.href === "/products")) {
    await page.goto("/products?dimension=variant&metric=units&compare=year");
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
    await expect(page.getByRole("table", { name: "Net units by variant details", exact: true })).toBeVisible();
  }
  if (appConfig.nav.some((item) => item.href === "/retention")) {
    await page.goto("/retention");
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
    await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
    const table = page.getByRole("table", { name: "Monthly retention", exact: true });
    await expect(table).toBeVisible();
    await expect(table.locator('td[data-state="value"]').first()).toBeVisible();
  }
});

test("the store and dates survive navigation, and the next page of orders loads", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("link", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/store=.+&from=/);
  // Wait for the regions to load, so the next click does not cancel their queries.
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
  test.skip(!appConfig.nav.some((item) => item.href === "/orders"), "no Orders view");
  await page.getByRole("link", { name: "Orders" }).click();
  await expect(page).toHaveURL(/\/orders\?store=/);
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
  const older = page.getByRole("link", { name: "Older orders" });
  test.skip((await older.count()) === 0, "this store has one page of orders in the last 7 days");
  await older.click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
  await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Newest orders" })).toBeVisible();
});

test("channel controls load complete rosters and apply a warehouse channel", async ({ page }) => {
  for (const [href, label] of [
    ["/products", "Sales channel"],
    ["/orders", "Sales channel"],
    ["/creatives", "Ad channel"],
  ]) {
    if (!appConfig.nav.some((item) => item.href === href)) continue;
    await page.goto(href as string);
    const select = page.getByLabel(label as string, { exact: true });
    await expect(select).toBeVisible({ timeout: 30000 });
    const option = select.locator('option:not([value=""])').first();
    const channel = await option.getAttribute("value");
    if (!channel) throw new Error("Expected a published demo channel");
    await select.selectOption(channel);
    await expect(select).toHaveValue(channel);
    await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30000 });
    await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
  }
  if (appConfig.nav.some((item) => item.href === "/retention")) {
    await page.goto("/retention?cohorts=earliest");
    await expect(page.getByRole("img", { name: "Gross profit LTV by cohort age chart", exact: true })).toBeVisible({
      timeout: 30000,
    });
  }
});
