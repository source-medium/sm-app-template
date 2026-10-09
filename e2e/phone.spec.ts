import { expect, test } from "@playwright/test";
import { appConfig } from "../app.config";
import { watchConsole } from "./helpers";

test("the data dictionary and field handoff fit a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(appConfig.nav[0]?.href ?? "/");
  const about = page.getByRole("button", { name: "About this data", exact: true });
  test.skip((await about.count()) === 0, "No report sources remain");
  await about.click();
  const panel = page.getByRole("dialog", { name: "About this data", exact: true });
  await expect(panel.getByLabel("Search fields")).toBeVisible();
  await panel.getByText("Report context", { exact: true }).click();
  expect(await panel.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
  await panel
    .getByRole("button", { name: /^Use field / })
    .first()
    .click();
  const composer = page.getByRole("dialog", { name: "Ask a coding agent" });
  await expect(composer).toBeVisible();
  expect(await composer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
});

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

test("the top bar fits a small touch screen when the brand font is unavailable", async ({ page }) => {
  await page.route(/fontshare\.com/, (route) => route.abort());
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await expect(page.getByRole("status")).toHaveCount(0);
  const controls = [
    page.getByRole("button", { name: "Toggle navigation" }),
    page.getByRole("button", { name: "Ask a coding agent" }),
    page.getByTestId("mode-chip"),
    page.getByRole("combobox", { name: "Appearance" }),
  ];
  for (const control of controls) {
    const box = await control.boundingBox();
    if (!box) throw new Error("A top-bar control is not visible");
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
});

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

test("connection report fits a small phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/connection");
  await page.getByRole("button", { name: "Check connection", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Sample mode is ready.");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
});
