import { expect, test } from "@playwright/test";
import { appConfig } from "../app.config";
import { watchConsole } from "./helpers";

for (const item of appConfig.nav) {
  test(`${item.href} fits phones and tablets without horizontal scrolling`, async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto(item.href);
    await expect(page.getByTestId("mode-chip")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    // Exercise both a small phone and the point where the persistent sidebar appears.
    for (const width of [320, 768]) {
      await page.setViewportSize({ width, height: 740 });
      // Recharts updates its SVG width on ResizeObserver's next frame.
      await expect
        .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), {
          message: `${width}px viewport`,
        })
        .toBeLessThanOrEqual(0);
    }
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

test("shared controls have touch-sized targets", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await expect(page.getByRole("status")).toHaveCount(0);
  const controls = page.locator(
    'button:visible, select:visible, input[type="date"]:visible, nav[aria-label="Date presets"] a:visible',
  );
  for (const control of await controls.all()) {
    const bounds = await control.boundingBox();
    expect(bounds?.height, (await control.getAttribute("aria-label")) ?? undefined).toBeGreaterThanOrEqual(44);
    expect(bounds?.width).toBeGreaterThanOrEqual(44);
  }
});

test("the navigation respects reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const duration = await sheet.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(duration).toBeLessThanOrEqual(0.001);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
});

test("the agent prompt composer fits a phone", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("button", { name: "Ask a coding agent" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask a coding agent" });
  await expect(dialog.getByLabel("Prompt")).toHaveValue(/Context from the running app/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("appearance can be changed on a phone", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("combobox", { name: "Appearance" }).selectOption("dark");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
});

test("the report can be refreshed on a phone", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  const refresh = page.getByRole("button", { name: "Refresh data", exact: true });
  test.skip((await refresh.count()) === 0, "the home page does not use ReportPage");
  test.skip((await page.locator('[data-slot="data-loaded-at"]').count()) === 0, "the home page has no data region");
  const timestamp = page.locator('[data-slot="data-loaded-at"]:visible').first();
  await expect(timestamp).toBeVisible();
  const before = await timestamp.getAttribute("datetime");
  await refresh.click();
  await expect(timestamp).not.toHaveAttribute("datetime", before ?? "");
  await expect(refresh).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
});
