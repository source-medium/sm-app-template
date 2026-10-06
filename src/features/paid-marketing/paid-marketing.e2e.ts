import { expect, test } from "@playwright/test";

test("paid marketing: each picker replaces its own value and preserves the other filters", async ({ page }) => {
  await page.goto("/paid-marketing?store=sample-store-b&from=2026-09-01&to=2026-09-07&metric=spend&channel=Google");
  await page.getByLabel("Measure", { exact: true }).selectOption("clicks");
  await expect(page).toHaveURL(/metric=clicks/);
  await page.getByLabel("Channel", { exact: true }).selectOption("Meta");
  await expect(page).toHaveURL(/channel=Meta/);
  const params = new URL(page.url()).searchParams;
  expect(params.getAll("metric")).toEqual(["clicks"]);
  expect(params.getAll("channel")).toEqual(["Meta"]);
  expect(params.get("store")).toBe("sample-store-b");
  expect(params.get("from")).toBe("2026-09-01");
  expect(params.get("to")).toBe("2026-09-07");
  await expect(page.getByRole("heading", { name: "Campaigns in Meta" })).toBeVisible();
});

test("paid marketing: a channel filter narrows the campaigns", async ({ page }) => {
  await page.goto("/paid-marketing");
  await page.getByLabel("Channel", { exact: true }).selectOption("Google");
  await expect(page).toHaveURL(/channel=Google/);
  await expect(page.getByRole("heading", { name: "Campaigns in Google" })).toBeVisible();
  const channels = await page
    .getByRole("table", { name: "Campaigns by spend" })
    .locator("tbody tr td:nth-child(2)")
    .allTextContents();
  expect(new Set(channels)).toEqual(new Set(["Google"]));
});
