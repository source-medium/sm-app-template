import { expect, test } from "@playwright/test";
import { appConfig } from "../app.config";
import { watchConsole, expectNoSeriousA11yViolations, choose } from "./helpers";

test("Overview fits a 320px viewport before chart hydration", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/overview"), "Example view removed");
  await page.setViewportSize({ width: 320, height: 740 });
  let releaseScripts!: () => void;
  const scriptsReady = new Promise<void>((resolve) => {
    releaseScripts = resolve;
  });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await scriptsReady;
    await route.continue();
  });
  try {
    await page.goto("/overview?store=sample-store-a&from=2026-09-01&to=2026-09-28", { waitUntil: "commit" });
    await expect(page.locator('[data-slot="kpi-value"]').first()).toBeVisible();
    await expect(page.getByLabel("Compare with", { exact: true })).toHaveAttribute("inert");
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  } finally {
    releaseScripts();
  }
  await expect(page.getByLabel("Compare with", { exact: true })).not.toHaveAttribute("inert");
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
});

for (const route of ["overview", "performance"]) {
  test(`${route}: results appear before the fold and collapsed filters preserve drafts`, async ({ page }) => {
    test.skip(!appConfig.nav.some((item) => item.href === `/${route}`), "Example view removed");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/${route}?store=sample-store-a&from=2026-09-01&to=2026-09-07`);
    const toggle = page.getByRole("button", { name: "Filters", exact: true });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    const result =
      route === "overview"
        ? page.locator('[data-slot="kpi-value"]').first()
        : page
            .getByRole("table", { name: "Revenue and orders", exact: true })
            .locator("tbody tr")
            .first()
            .getByRole("cell")
            .nth(1);
    await expect(result).toBeInViewport({ ratio: 1 });
    await expectNoSeriousA11yViolations(page);
    const appliedURL = page.url();
    const csv = page.getByRole("link", {
      name: route === "overview" ? "Download CSV" : "Download business CSV",
      includeHidden: true,
      exact: true,
    });
    const appliedCSV = await csv.getAttribute("href");
    await toggle.tap();
    const channel = page.getByRole("combobox", { name: "Sales channel", exact: true });
    await expect(channel).toBeVisible();
    await page.getByText("Choose multiple channels", { exact: true }).tap();
    // From the valid default, clear the draft and keep one channel.
    await page.getByRole("checkbox", { name: "All channels, including non-valid", exact: true }).check();
    await page.getByRole("checkbox", { name: "amazon", exact: true }).check();
    await expect(channel).toHaveValue('["amazon","online_dtc","retail","tiktok_shop","wholesale"]');
    await expect(page).toHaveURL(appliedURL);
    await expect(csv).toHaveAttribute("href", appliedCSV ?? "");
    await expect(page.getByRole("status")).toHaveText("Channel changes not applied.");
    await page.getByText("Choose multiple channels", { exact: true }).tap();
    await expect(page.getByRole("status")).toBeVisible();
    await toggle.tap();
    await expect(channel).toBeHidden();
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    // A date submission still includes the mounted channel draft, even with the panel closed.
    await page.getByRole("button", { name: /^Change dates/ }).tap();
    await page.getByLabel("From", { exact: true }).fill("2026-09-02");
    await page.getByRole("button", { name: "Apply", exact: true }).tap();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("sales_channel") === "amazon" && url.searchParams.get("from") === "2026-09-02",
    );
    await toggle.tap();
    await expect(channel).toHaveValue("amazon");
    await expect(page.getByRole("status")).toHaveCount(0);
    await choose(page, "Sales channel", "online_dtc");
    await expect(page).toHaveURL(/sales_channel=online_dtc/);
    await expectNoSeriousA11yViolations(page);
  });
}

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
  const composer = page.getByRole("dialog", { name: "Vibe code" });
  await expect(composer).toBeVisible();
  expect(await composer.evaluate((node) => node.scrollWidth - node.clientWidth)).toBe(0);
});

for (const item of appConfig.nav) {
  test(`${item.href} fits phones and tablets without horizontal scrolling`, async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto(item.href);
    await expect(page.getByTestId("mode-chip")).toBeVisible();
    await expect(page.getByRole("status")).toHaveCount(0);
    // Cover small phones, sidebar appearance, and the header's single-row breakpoint.
    for (const width of [320, 640, 768, 1024]) {
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

test("the top bar fits a small touch screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await expect(page.getByRole("status")).toHaveCount(0);
  const controls = [
    page.getByRole("button", { name: "Toggle navigation" }),
    page.getByRole("button", { name: "Vibe code" }),
    page.getByTestId("mode-chip"),
    page.getByRole("button", { name: /^Appearance:/ }),
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

test("store switching is visible and usable on a small touch screen", async ({ page }) => {
  const report = appConfig.nav.find((item) => item.scope !== "all-stores");
  test.skip(!report, "No single-store view");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(`${report?.href ?? "/"}?store=sample-store-a&from=2026-09-01&to=2026-09-07`);
  const trigger = page.getByRole("button", { name: "Store: Sample Store A" });
  await expect(trigger.getByText("Switch store", { exact: true })).toBeVisible();
  expect((await trigger.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await trigger.tap();
  const dialog = page.getByRole("dialog", { name: "Switch store" });
  // Opening the picker should show stores, not summon the on-screen keyboard.
  const search = dialog.getByRole("searchbox", { name: "Search stores" });
  await expect(search).not.toBeFocused();
  await expect(dialog).toBeFocused();
  const option = dialog.getByRole("button", { name: "Sample Store B", exact: true });
  await expect(option).toContainText("b.example.com");
  expect((await option.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  await expectNoSeriousA11yViolations(page);
  await search.tap();
  await search.fill("b.example.com");
  await option.tap();
  await expect(page.getByRole("button", { name: "Store: Sample Store B" })).toBeVisible();
  await expect(page).toHaveURL(/store=sample-store-b/);
  expect(new URL(page.url()).searchParams.get("from")).toBe("2026-09-01");
  await page.getByRole("button", { name: "Store: Sample Store B" }).press("Enter");
  await expect(search).toBeFocused();
});

test("report fields have room for their values on the smallest phones", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  const form = page.getByRole("form", { name: "Report filters" });
  await expect(form).toBeVisible();
  // On phones the date fields sit behind the applied range until someone wants to change them.
  const change = form.getByRole("button", { name: /^Change dates/ });
  if (await change.count()) {
    await expect(change).toContainText("Sep");
    await change.click();
  }
  const controls = form.locator('select, input[type="date"]');
  for (const control of await controls.all()) {
    expect((await control.boundingBox())?.width).toBeGreaterThanOrEqual(240);
  }
});

test("the retention month and its apply action fit a small phone", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/retention"), "Retention was removed");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/retention?as_of=2026-09");
  const group = page.getByRole("group", { name: "Cohort observation window" });
  const month = group.getByLabel("Through completed month");
  const apply = group.getByRole("button", { name: "Apply month", exact: true });
  for (const control of [month, apply]) {
    const box = await control.boundingBox();
    if (!box) throw new Error("A cohort window control is not visible");
    expect(box.width).toBeGreaterThanOrEqual(240);
    expect(box.x + box.width).toBeLessThanOrEqual(320);
  }
  await month.fill("2026-08");
  await apply.click();
  await expect(page).toHaveURL(/as_of=2026-08/);
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

test("the navigation and appearance menu respect reduced motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toBeVisible();
  const duration = await sheet.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration));
  expect(duration).toBeLessThanOrEqual(0.001);
  await page.keyboard.press("Escape");
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: /^Appearance:/ }).click();
  const menu = page.getByRole("menu", { name: "Appearance" });
  await expect(menu).toBeVisible();
  expect(await menu.evaluate((element) => parseFloat(getComputedStyle(element).animationDuration))).toBeLessThanOrEqual(
    0.001,
  );
  await page.keyboard.press("Escape");
  await expect(menu).toBeHidden();
});

test("the agent prompt composer fits a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("button", { name: "Vibe code" }).click();
  const dialog = page.getByRole("dialog", { name: "Vibe code" });
  await expect(dialog.getByLabel("Prompt")).toHaveValue(/Context from the running app/);
  await expect(dialog.getByLabel("Your request")).toBeFocused();
  await expect(dialog.getByLabel("Prompt")).toBeHidden();
  const copy = dialog.getByRole("button", { name: "Copy prompt" });
  await expect(copy).toBeInViewport({ ratio: 1 });
  await expect(copy).toBeDisabled();
  await dialog.getByLabel("Your request").fill("Make the report easier to scan.");
  await expect(copy).toBeEnabled();
  await dialog.getByText("Preview prompt", { exact: true }).click();
  await expect(dialog.getByLabel("Prompt")).toBeVisible();
  await expect(copy).toBeInViewport({ ratio: 1 });
  await expectNoSeriousA11yViolations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBe(
    0,
  );
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
});

test("appearance can be changed on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await page.getByRole("button", { name: /^Appearance:/ }).tap();
  const menu = page.getByRole("menu", { name: "Appearance" });
  const bounds = await menu.boundingBox();
  if (!bounds) throw new Error("The appearance menu is not visible");
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(320);
  for (const item of await menu.getByRole("menuitemradio").all()) {
    expect((await item.boundingBox())?.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole("menuitemradio", { name: "Dark", exact: true }).tap();
  await expect(menu).toBeHidden();
  await expect(page.getByRole("button", { name: "Appearance: Dark", exact: true })).toBeVisible();
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

test("phone: name filters fit and the element picker selects by touch", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/creatives"), "No Creatives view");
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/creatives?store=sample-store-a&from=2026-09-01&to=2026-09-07");
  await page.getByRole("button", { name: "Add name filter" }).tap();
  await page.getByLabel("Values, one per line").fill("[retargeting]");
  await expectNoSeriousA11yViolations(page);
  await page.getByRole("button", { name: "Apply name filter" }).tap();
  await expect(page.getByRole("button", { name: /^Edit Campaign name/ })).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Vibe code" }).tap();
  const dialog = page.getByRole("dialog", { name: "Vibe code" });
  await dialog.getByLabel("Your request").fill("Simplify this control.");
  await dialog.getByRole("button", { name: "Pick an element" }).tap();
  await page.getByRole("button", { name: "Add name filter" }).tap();
  await expect(dialog.getByLabel("Prompt")).toContainText('Component: "AdNameFilter"');
  await expect(dialog.getByLabel("Your request")).toHaveValue("Simplify this control.");
  await expect(page.getByLabel("Values, one per line")).toHaveCount(0);
});
