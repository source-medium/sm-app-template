import { expect, test } from "@playwright/test";

test("paid marketing: a channel filter narrows the campaigns", async ({ page }) => {
  await page.goto("/paid-marketing");
  await page.getByLabel("Channel", { exact: true }).selectOption("Google");
  await expect(page).toHaveURL(/channel=Google/);
  await expect(page.getByRole("heading", { name: "Campaigns in Google" })).toBeVisible();
  const channels = await page
    .getByRole("table", { name: "Campaigns by impressions" })
    .locator("tbody tr td:nth-child(2)")
    .allTextContents();
  expect(new Set(channels)).toEqual(new Set(["Google"]));
});
