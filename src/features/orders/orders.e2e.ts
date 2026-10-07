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
  await expect(page.getByRole("link", { name, exact: true }).first()).toBeFocused();
  await page.goto("/orders");
  await page.getByRole("link", { name: "Older orders" }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByRole("link", { name: "Newest orders" })).toBeVisible();
});

test("orders: channel selection survives paging and search, and changing it resets the cursor", async ({ page }) => {
  await page.goto("/orders?store=sample-store-a&from=2026-09-01&to=2026-09-28&sales_channel=Amazon");
  const table = page.getByRole("table", { name: "Orders, newest first" });
  await expect(table).toBeVisible();
  await expect(table.locator("tbody tr").first()).toContainText("Amazon");
  await page.getByRole("link", { name: "Older orders", exact: true }).click();
  await expect(page).toHaveURL(/cursor=/);
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("Amazon");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("Online DTC");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).not.toHaveURL(/cursor=/);
  await expect(table.locator("tbody tr").first()).toContainText("Online DTC");
  const name = await table.getByRole("link").first().innerText();
  await page.getByLabel("Find an order").fill(name);
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === name);
  await expect(table.getByRole("link", { name, exact: true })).toBeVisible();
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("Online DTC");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("Amazon");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("q") === name && url.searchParams.get("sales_channel") === "Amazon",
  );
  await expect(page.getByText("No orders match that search, sales channel, and date range.")).toBeVisible();
  await page.goto("/orders?store=sample-store-a&sales_channel=unknown");
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("unknown");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(table).toBeVisible();
});

test("orders: closing a deep-linked drawer falls back to the list heading", async ({ page }) => {
  await page.goto("/orders");
  const href = await page
    .getByRole("table", { name: "Orders, newest first" })
    .getByRole("link")
    .first()
    .getAttribute("href");
  if (!href) throw new Error("Missing order link");
  await page.goto(`${href}&q=no-matching-order`);
  await expect(page.getByRole("dialog", { name: "Order details" })).toBeVisible();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page).not.toHaveURL(/order=/);
  await expect(page.getByRole("heading", { name: "Orders, newest first", exact: true })).toBeFocused();
});
