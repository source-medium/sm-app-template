import { expect, test } from "@playwright/test";

test("orders: column headers stay visible while scrolling rows", async ({ page }) => {
  await page.goto("/orders");
  const table = page.getByRole("table");
  await expect(table).toBeVisible();
  const positions = await table.evaluate((element) => {
    const scroller = element.parentElement;
    const head = element.querySelector("thead");
    if (!scroller || !head) throw new Error("Expected a scrolling table with headers");
    const before = head.getBoundingClientRect().top;
    scroller.scrollTop = 240;
    return { before, after: head.getBoundingClientRect().top, scroll: scroller.scrollTop };
  });
  expect(positions.scroll).toBeGreaterThan(0);
  expect(Math.abs(positions.after - positions.before)).toBeLessThanOrEqual(1);
});

test("orders: sharing preserves encoded search input and the selected store", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/orders?store=sample-store-b&q=%23%26%25");
  await page.getByRole("button", { name: "Copy report link" }).click();
  await expect(page.getByText("Report link copied.", { exact: true })).toHaveCount(1);
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.searchParams.get("q")).toBe("#&%");
  expect(copied.searchParams.get("store")).toBe("sample-store-b");
  expect(copied.searchParams.get("from")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
});

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
