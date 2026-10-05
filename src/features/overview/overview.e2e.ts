import { expect, test } from "@playwright/test";

test("overview: a chart opens as an accessible table", async ({ page }) => {
  await page.goto("/overview");
  const card = page.locator('[data-slot="card"]', { hasText: "Orders by day" });
  await card.getByRole("button", { name: "View as table" }).click();
  await expect(card.getByRole("table", { name: "Orders by day" })).toBeVisible();
  await expect(card.getByRole("columnheader", { name: "Orders" })).toBeVisible();
});
