/**
 * Checks that hold for every page in the navigation, so they keep working as
 * you add and remove views. View-specific tests live beside each view as
 * src/features/<view>/<view>.e2e.ts.
 */
import { expect, test } from "@playwright/test";
import { appConfig } from "../app.config";
import { expectNoSeriousA11yViolations, watchConsole } from "./helpers";

const home = appConfig.nav[0]?.href ?? "/";

for (const item of appConfig.nav) {
  test(`${item.href} renders sample data accessibly`, async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto(item.href);
    await expect(page.getByTestId("mode-chip")).toHaveText("Sample data");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    await expectNoSeriousA11yViolations(page);
    expect(problems).toEqual([]);
  });
}

test("the home page is the first navigation entry", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`${home}$`));
});

test("filters live in the URL and survive a reload", async ({ page }) => {
  await page.goto(home);
  await page.getByLabel("Store").selectOption("sample-store-b");
  await expect(page).toHaveURL(/store=sample-store-b/);
  const preset = page.getByRole("link", { name: "Last 7 days" });
  const href = (await preset.getAttribute("href")) ?? "";
  expect(href).toContain("store=sample-store-b");
  await preset.click();
  await expect(page).toHaveURL(href);
  await page.reload();
  await expect(page.getByLabel("Store")).toHaveValue("sample-store-b");
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("aria-current", "true");
});

test("keyboard users can reach the navigation", async ({ page }) => {
  const target = appConfig.nav.at(-1);
  test.skip(!target || appConfig.nav.length < 2, "needs two pages");
  await page.goto(home);
  const link = page.getByRole("link", { name: target?.label ?? "" });
  for (let index = 0; index < 12 && !(await link.evaluate((node) => node === document.activeElement)); index += 1) {
    await page.keyboard.press("Tab");
  }
  await expect(link).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(new RegExp(target?.href ?? ""));
});

test("responses carry the private-app headers", async ({ request }) => {
  const response = await request.get(home);
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["cache-control"]).toMatch(/no-store/);
});
