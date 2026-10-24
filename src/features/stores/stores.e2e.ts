import { appConfig } from "@/app.config";
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations, switchStore, watchConsole } from "../../../e2e/helpers";

const period = "from=2026-09-01&to=2026-09-07";
test("switches independently of invalid date drafts and clears campaign drill-through", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/creatives"), "No Creatives view");
  await page.goto(`/creatives?store=sample-store-a&${period}&campaign=cmp-1002&sort=spend`);
  await page.getByLabel("From", { exact: true }).fill("2026-09-10");
  await switchStore(page, "sample-store-b");
  const params = new URL(page.url()).searchParams;
  expect(params.get("from")).toBe("2026-09-01");
  expect(params.get("to")).toBe("2026-09-07");
  expect(params.has("campaign")).toBe(false);
  expect(params.get("sort")).toBe("spend");
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-09-01");
  await expect(page.locator("[data-agent-page]")).toHaveAttribute("data-agent-page", /"store":"sample-store-b"/);
});
test("compares stores separately and drills through with the same dates", async ({ page }) => {
  const errors = watchConsole(page);
  test.skip(!appConfig.nav.some((item) => item.href === "/overview"), "No Overview view");
  await page.goto(`/overview?store=sample-store-a&${period}&sales_channel=amazon`);
  await page.getByRole("button", { name: /^Store:/ }).click();
  await page
    .getByRole("dialog", { name: "Switch store" })
    .getByRole("button", { name: "All stores", exact: true })
    .click();
  await expect(page.getByRole("button", { name: "Store: All stores" })).toHaveAttribute("data-store-id", "all");
  expect(new URL(page.url()).searchParams.has("sales_channel")).toBe(false);
  const table = page.getByRole("table", { name: "Store performance" });
  await expect(table.getByRole("row")).toHaveCount(3);
  await expect(table.getByRole("row").nth(1)).toContainText("USD");
  await expect(table.getByRole("row").nth(2)).toContainText("USD");
  await expect(table.getByRole("columnheader", { name: "Net revenue" }).getByRole("button")).toHaveCount(0);
  const revenue = await table.getByRole("row").nth(2).getByRole("cell").nth(3).innerText();
  await page.getByRole("button", { name: "Vibe code" }).click();
  await expect(page.getByRole("dialog").getByLabel("Prompt", { exact: true })).toHaveValue(
    /Store scope: all available stores/,
  );
  await page.keyboard.press("Escape");
  await table.getByRole("link", { name: "Sample Store B", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/overview\\?.*store=sample-store-b`));
  await expect(page.getByLabel("From", { exact: true })).toHaveValue("2026-09-01");
  await expect(page.locator('[data-agent-target="Net revenue"] [data-slot="kpi-value"]')).toHaveText(revenue);
  expect(errors).toEqual([]);
});
test("the persistent picker supports search, keyboard recovery, and narrow screens", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`/stores?store=sample-store-a&${period}`);
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  const trigger = page.getByRole("button", { name: "Store: All stores" });
  await expect(trigger).toBeInViewport();
  const label = trigger.locator("span").first();
  expect(await label.evaluate((element) => element.clientWidth >= element.scrollWidth)).toBe(true);
  const storeBox = await trigger.boundingBox();
  const agentBox = await page.getByRole("button", { name: "Vibe code" }).boundingBox();
  expect(storeBox && agentBox && storeBox.y >= agentBox.y + agentBox.height).toBe(true);
  await trigger.click();
  const search = page.getByRole("searchbox", { name: "Search stores" });
  await expect(search).toBeFocused();
  await search.fill("no-such-store");
  await expect(page.getByRole("status")).toContainText("No matching stores");
  await expect(
    page.getByRole("dialog", { name: "Switch store" }).getByRole("button", { name: "All stores", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Clear search" }).click();
  await expect(search).toBeFocused();
  await expect(search).toHaveValue("");
  await search.fill("b.example.com");
  const option = page.getByRole("dialog", { name: "Switch store" }).getByRole("button", { name: "Sample Store B" });
  await expect(option).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await trigger.press("Enter");
  await search.fill("Sample Store B");
  await search.press("ArrowDown");
  await expect(option).toBeFocused();
  await option.press("Enter");
  await expect(page.getByRole("button", { name: "Store: Sample Store B" })).toHaveAttribute(
    "data-store-id",
    "sample-store-b",
  );
});

test("keeps the applied store label while a store navigation is in flight", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/overview"), "No Overview view");
  await page.goto(`/overview?store=sample-store-a&${period}`);
  let release = () => {};
  const paused = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/overview?*store=sample-store-b*", async (route) => {
    await paused;
    await route.continue();
  });
  try {
    await page.getByRole("button", { name: /^Store:/ }).click();
    await page.getByRole("dialog", { name: "Switch store" }).getByRole("button", { name: "Sample Store B" }).click();
    await expect(page.getByRole("status")).toHaveText("Switching to Sample Store B…");
    await expect(page.getByRole("button", { name: "Store: Sample Store A" })).toBeDisabled();
    await expect(page.locator("[data-agent-page]")).toHaveAttribute("data-agent-page", /"store":"sample-store-a"/);
  } finally {
    release();
  }
  await expect(page.getByRole("button", { name: "Store: Sample Store B" })).toBeEnabled();
  await expect(page.locator("[data-agent-page]")).toHaveAttribute("data-agent-page", /"store":"sample-store-b"/);
});

test("Vibe code can pick the persistent store control without opening its menu", async ({ page }) => {
  await page.goto(`/stores?store=sample-store-a&${period}`);
  await expect(page.getByRole("button", { name: "Store: All stores" })).toBeVisible();
  await page.getByRole("button", { name: "Vibe code" }).click();
  const dialog = page.getByRole("dialog", { name: "Vibe code" });
  await dialog.getByRole("button", { name: "Pick an element" }).click();
  await page.getByRole("button", { name: "Store: All stores" }).click();
  await expect(dialog.getByLabel("Prompt")).toHaveValue(/Component: "StoreSwitcher"/);
  await expect(page.getByRole("dialog", { name: "Switch store" })).toHaveCount(0);
});
