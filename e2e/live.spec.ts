/**
 * Live checks against your own warehouse (`pnpm test:live`, with your
 * configuration in .env.local). Every page must render live data with no
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
    await expect(page.getByText("Queried at")).toBeVisible();
    expect(problems).toEqual([]);
  });
}

test("the store and dates survive navigation, and the next page of orders loads", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("link", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/store=.+&from=/);
  test.skip(!appConfig.nav.some((item) => item.href === "/orders"), "no Orders view");
  await page.getByRole("link", { name: "Orders" }).click();
  await expect(page).toHaveURL(/\/orders\?store=/);
  const older = page.getByRole("link", { name: "Older orders" });
  if (await older.count()) {
    await older.click();
    await expect(page).toHaveURL(/cursor=/);
    await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
  }
});
