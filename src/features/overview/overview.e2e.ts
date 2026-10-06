import { expect, test } from "@playwright/test";

test("overview: a chart opens as an accessible table", async ({ page }) => {
  await page.goto("/overview");
  const card = page.locator('[data-slot="card"]', { hasText: "Summary orders by day" });
  await card.getByRole("button", { name: "View as table" }).click();
  await expect(card.getByRole("table", { name: "Summary orders by day" })).toBeVisible();
  await expect(card.getByRole("columnheader", { name: "Summary orders" })).toBeVisible();
});

test("unknown stores remain unselected until the viewer chooses a valid store", async ({ page }) => {
  await page.goto("/overview?store=unknown-store");
  await expect(page.getByText("That store is not in this warehouse")).toBeVisible();
  await expect(page.getByLabel("Store")).toHaveValue("unknown-store");
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("href", /store=unknown-store/);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/store=unknown-store/);
  await expect(page.getByText("That store is not in this warehouse")).toBeVisible();
  await page.getByLabel("Store").selectOption("sample-store-a");
  await expect(page).toHaveURL(/store=sample-store-a/);
  await expect(page.getByText("That store is not in this warehouse")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("href", /store=sample-store-a/);
});
