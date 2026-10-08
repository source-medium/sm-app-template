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
    const report = page.locator("main [data-agent-page]");
    if (await report.count()) {
      const context = JSON.parse((await report.getAttribute("data-agent-page")) ?? "{}");
      expect(context.pathname).toBe(item.href);
      expect(context.filters.store).toBe(await page.getByRole("combobox", { name: "Store", exact: true }).inputValue());
      const targets = await page.locator("main [data-agent-target][data-agent-component]").count();
      await page.getByRole("button", { name: "Ask a coding agent" }).click();
      const dialog = page.getByRole("dialog", { name: "Ask a coding agent" });
      await expect(dialog.getByLabel("Target", { exact: true }).locator("option")).toHaveCount(targets + 1);
      if (targets) {
        const targetOption = dialog.getByLabel("Target", { exact: true }).locator("option").nth(1);
        await dialog
          .getByLabel("Target", { exact: true })
          .selectOption((await targetOption.getAttribute("value")) ?? "");
        expect(await dialog.getByLabel("Prompt", { exact: true }).inputValue()).toContain("- Component:");
      }
      await page.keyboard.press("Escape");
    }
    expect(problems).toEqual([]);
  });
}

test("the home page is the first navigation entry", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(new RegExp(`${home}$`));
});

test("filters live in the URL and survive a reload", async ({ page }) => {
  await page.goto(home);
  // A home page without a store picker or date range (dates={false}) has nothing here to keep.
  test.skip((await page.getByLabel("Store").count()) === 0, "the home page has no store filter");
  await expect(page.getByLabel("Store").locator('optgroup[label="Sample Brand"]')).toHaveCount(1);
  await expect(page.getByLabel("Store").locator('option[value="sample-store-b"]')).toHaveText("Sample Store B");
  await page.getByLabel("Store").selectOption("sample-store-b");
  await expect(page).toHaveURL(/store=sample-store-b/);
  const preset = page.getByRole("link", { name: "Last 7 days" });
  test.skip((await preset.count()) === 0, "the home page has no date range");
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

test("collapsed navigation keeps its labels available through tooltips", async ({ page }) => {
  const target = appConfig.nav[0];
  test.skip(!target, "needs a navigation entry");
  const problems = watchConsole(page);
  await page.goto(home);
  const sidebar = page.locator('[data-slot="sidebar"]').first();
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(sidebar).toHaveAttribute("data-state", "collapsed");
  await page.getByRole("link", { name: target?.label ?? "", exact: true }).hover();
  await expect(page.getByRole("tooltip")).toHaveText(target?.label ?? "");
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(sidebar).toHaveAttribute("data-state", "expanded");
  expect(problems).toEqual([]);
});

test("responses carry the private-app headers", async ({ request }) => {
  const response = await request.get(home);
  expect(response.headers()["x-robots-tag"]).toBe("noindex, nofollow");
  expect(response.headers()["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(response.headers()["cache-control"]).toMatch(/no-store/);
});

test.describe("dark mode", () => {
  test.use({ colorScheme: "dark" });
  for (const item of appConfig.nav) {
    test(`${item.href} is accessible in dark mode`, async ({ page }) => {
      await page.goto(item.href);
      await expect(page.getByTestId("mode-chip")).toBeVisible();
      await expectNoSeriousA11yViolations(page);
    });
  }
});

test("appearance overrides the system, survives reloads, and can follow the system again", async ({ page }) => {
  const problems = watchConsole(page);
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto(home);
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");

  const appearance = page.getByRole("combobox", { name: "Appearance" });
  await expect(appearance).toHaveValue("system");
  await expectNoSeriousA11yViolations(page);
  await appearance.selectOption("light");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  const response = await page.reload();
  expect(await response?.text()).toContain('data-theme="light"');
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");

  const target = appConfig.nav.at(-1);
  if (target && appConfig.nav.length > 1) {
    await page.getByRole("link", { name: target.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(target.href));
    await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  }
  await expect(appearance).toHaveValue("light");
  await appearance.selectOption("dark");
  await page.emulateMedia({ colorScheme: "light" });
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");

  await appearance.selectOption("system");
  await expect(page.locator("html")).toHaveCSS("color-scheme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
  expect(problems).toEqual([]);
});

test("a saved appearance and the JavaScript requirement render without JavaScript", async ({ browser, baseURL }) => {
  if (!baseURL) throw new Error("The sample project needs a baseURL");
  const context = await browser.newContext({ javaScriptEnabled: false, colorScheme: "light" });
  try {
    await context.addCookies([{ name: "sm-theme", value: "dark", url: baseURL }]);
    const page = await context.newPage();
    await page.goto(`${baseURL}${home}`);
    await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
    await expect(page.locator("html")).toHaveCSS("color-scheme", "dark");
    await expect(page.locator("noscript p")).toBeVisible();
    await expect(page.locator("noscript p")).toHaveText("Enable JavaScript to load reports and use their filters.");
  } finally {
    await context.close();
  }
});

test("copy link freezes applied defaults and ignores unapplied filter edits", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${home}?from=invalid&to=invalid`);
  test.skip((await page.getByLabel("From", { exact: true }).count()) === 0, "the home page has no date range");
  const store = await page.getByLabel("Store", { exact: true }).inputValue();
  const from = await page.getByLabel("From", { exact: true }).inputValue();
  const to = await page.getByLabel("To", { exact: true }).inputValue();
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Copy report link" }).click();
  await expect(page.getByText("Report link copied.", { exact: true })).toHaveCount(1);
  const copied = new URL(await page.evaluate(() => navigator.clipboard.readText()));
  expect(copied.origin).toBe(new URL(page.url()).origin);
  expect(copied.pathname).toBe(home);
  const compare = page.locator('select[name="compare"]');
  expect(Object.fromEntries(copied.searchParams)).toEqual({
    store,
    from,
    to,
    ...((await compare.count()) ? { compare: await compare.inputValue() } : {}),
  });
  await page.goto(copied.href);
  await expect(page.getByLabel("Store", { exact: true })).toHaveValue(store);
  await expect(page.getByLabel("From", { exact: true })).toHaveValue(from);
  await expect(page.getByLabel("To", { exact: true })).toHaveValue(to);
});

test("the agent prompt carries the page, its filters, and the request", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`${home}?from=2026-09-01&to=2026-09-07`);
  const title = await page.getByRole("heading", { level: 1 }).innerText();
  await page.getByRole("button", { name: "Ask a coding agent" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask a coding agent" });
  await dialog.getByLabel("What do you need?").selectOption("check");
  await dialog.getByLabel("Describe it").fill("The first number looks too high.");
  await expectNoSeriousA11yViolations(page);
  await dialog.getByRole("button", { name: "Copy prompt" }).click();
  await expect(dialog.getByText("Prompt copied.", { exact: true })).toHaveCount(1);
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toBe(await dialog.getByLabel("Prompt").inputValue());
  expect(copied).toContain(`- Page: ${JSON.stringify(title)} (${home})`);
  if (await page.getByLabel("From", { exact: true }).count())
    expect(copied).toContain('from="2026-09-01", to="2026-09-07"');
  expect(copied).toContain("The first number looks too high.");
  expect(copied).toContain("- Data mode: sample data");
  expect(copied).toContain("Read AGENTS.md first");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Ask a coding agent" })).toBeFocused();
});

test("agent context captures resolved defaults and ignores unapplied edits", async ({ page }) => {
  await page.goto(home);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  test.skip((await page.locator("main [data-agent-page]").count()) === 0, "the home page has no report context");
  const store = page.getByRole("combobox", { name: "Store", exact: true });
  await expect(store).toBeVisible();
  const appliedStore = await store.inputValue();
  const from = page.getByLabel("From", { exact: true });
  const appliedFrom = (await from.count()) ? await from.inputValue() : null;
  await store.selectOption(appliedStore === "sample-store-a" ? "sample-store-b" : "sample-store-a");
  if (appliedFrom) await from.fill("2020-01-01");
  await page.getByRole("button", { name: "Ask a coding agent" }).click();
  const dialog = page.getByRole("dialog", { name: "Ask a coding agent" });
  const prompt = await dialog.getByLabel("Prompt", { exact: true }).inputValue();
  expect(prompt).toContain(`store=${JSON.stringify(appliedStore)}`);
  if (appliedFrom) expect(prompt).toContain(`from=${JSON.stringify(appliedFrom)}`);
  expect(prompt).not.toContain("2020-01-01");
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(page.getByRole("button", { name: "Ask a coding agent" })).toBeFocused();
});

test("agent context matches first-value URL parsing and excludes unrelated query values", async ({ page }) => {
  await page.goto(`${home}?store=sample-store-a&store=sample-store-b&access_token=TOKEN_SENTINEL`);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  test.skip((await page.locator("main [data-agent-page]").count()) === 0, "the home page has no report context");
  const store = page.getByRole("combobox", { name: "Store", exact: true });
  await expect(store).toHaveValue("sample-store-a");
  await page.getByRole("button", { name: "Ask a coding agent" }).click();
  const prompt = await page.getByRole("dialog").getByLabel("Prompt", { exact: true }).inputValue();
  expect(prompt).toContain('store="sample-store-a"');
  expect(prompt).not.toContain("sample-store-b");
  expect(prompt).not.toContain("TOKEN_SENTINEL");
  expect(prompt).not.toContain("access_token");
});

test("copy failure offers the complete applied link for manual copying", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: () => Promise.reject(new DOMException("Denied", "NotAllowedError")) },
    });
  });
  await page.goto(home);
  test.skip((await page.getByRole("button", { name: "Copy report link" }).count()) === 0, "no report to share");
  await page.getByRole("button", { name: "Copy report link" }).click();
  await expect(page.getByText("Could not copy. Select and copy the link below.")).toBeVisible();
  const manual = new URL(await page.getByRole("textbox", { name: "Report link" }).inputValue());
  expect(manual.searchParams.get("store")).toBe(await page.getByLabel("Store", { exact: true }).inputValue());
  await expectNoSeriousA11yViolations(page);
});

test("refresh re-reads the report, shows progress, and keeps applied filters", async ({ page }) => {
  const problems = watchConsole(page);
  await page.goto(`${home}?store=sample-store-b&from=2026-09-01&to=2026-09-07`);
  const refresh = page.getByRole("button", { name: "Refresh data", exact: true });
  test.skip((await refresh.count()) === 0, "the home page does not use ReportPage");
  test.skip((await page.locator('[data-slot="data-loaded-at"]').count()) === 0, "the home page has no data region");
  const timestamp = page.locator('[data-slot="data-loaded-at"]:visible').first();
  await expect(timestamp).toBeVisible();
  const before = await timestamp.getAttribute("datetime");
  const url = page.url();
  const from = page.getByLabel("From", { exact: true });
  if (await from.count()) await from.fill("2020-01-01");

  // Hold the real server response so pending behavior is observable without a timing race.
  let release = () => {};
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  let refreshRequests = 0;
  await page.route("**/*", async (route) => {
    const request = route.request();
    if (request.headers().rsc === "1" && new URL(request.url()).pathname === home) {
      refreshRequests += 1;
      const response = await route.fetch();
      await held;
      await route.fulfill({ response });
    } else {
      await route.continue();
    }
  });
  try {
    await refresh.click();
    await expect(refresh).toBeDisabled();
    await expect(refresh).toHaveText("Refreshing…");
    await expect(page.getByText("Refreshing report data.", { exact: true })).toHaveCount(1);
    await expect(timestamp).toHaveAttribute("datetime", before ?? "");
    await expect(page).toHaveURL(url);
  } finally {
    release();
  }
  await expect(refresh).toBeEnabled();
  await expect(timestamp).not.toHaveAttribute("datetime", before ?? "");
  await expect(page).toHaveURL(url);
  await expect(page.getByLabel("Store", { exact: true })).toHaveValue("sample-store-b");
  if (await from.count()) await expect(from).toHaveValue("2020-01-01");
  expect(refreshRequests).toBe(1);
  expect(problems).toEqual([]);
});
