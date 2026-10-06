import { expect, test } from "@playwright/test";
import { appConfig } from "../app.config";
import { watchConsole } from "./helpers";

for (const item of appConfig.nav) {
  test(`${item.href} fits a phone without horizontal scrolling`, async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto(item.href);
    await expect(page.getByTestId("mode-chip")).toBeVisible();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    expect(problems).toEqual([]);
  });
}

test("the navigation opens as a sheet", async ({ page }) => {
  const target = appConfig.nav.at(-1);
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page.getByRole("link", { name: target?.label ?? "" }).click();
  await expect(page).toHaveURL(new RegExp(target?.href ?? ""));
});

test("appearance can be changed on a phone", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
});
