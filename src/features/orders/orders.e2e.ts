import { expect, test } from "@playwright/test";

test("orders: search, open an order's details by URL, close, and page", async ({ page }) => {
  await page.goto("/orders");
  const firstLink = page.getByRole("table", { name: "Orders, newest first" }).getByRole("link").first();
  const name = (await firstLink.textContent()) ?? "";
  await page.getByLabel("Find an order").fill(name.replace("#", ""));
  await page.getByRole("button", { name: "Search" }).click();
  await expect(page).toHaveURL(/q=/);
  await page.getByRole("link", { name }).first().click();
  await expect(page).toHaveURL(/order=/);
  const drawer = page.getByRole("dialog", { name: "Order details" });
  await expect(drawer.getByText(name, { exact: true })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page).not.toHaveURL(/order=/);
  await page.goto("/orders");
  await page.getByRole("link", { name: "Older orders" }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByRole("link", { name: "Newest orders" })).toBeVisible();
});
