/**
 * Live checks against your own warehouse (`pnpm test:live`, with your
 * configuration in environment settings or .env.local), or a deployment
 * (`pnpm test:hosted`, viewer credentials only). Every page must render live data with no
 * error state. These run real BigQuery queries, so they are opt-in.
 */
import { expect, test, type Page } from "@playwright/test";
import { appConfig } from "../app.config";
import { watchConsole } from "./helpers";

/** Empty results are successful queries; failed or missing regions are not. */
async function expectLiveReport(page: Page) {
  await expect(page.getByTestId("mode-chip")).toHaveText("Live data");
  await expect(page.getByRole("status")).toHaveCount(0, { timeout: 30_000 });
  // Next's route announcer also has role="alert", so use the app's error marker.
  await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
  await expect(page.getByText("Queried at").first()).toBeVisible();
}

function emptyRetention(page: Page) {
  return page
    .getByText("No published acquisition cohorts for this store and observation window.", { exact: true })
    .or(page.getByText("No cohorts for this channel. Choose another acquisition sales channel.", { exact: true }));
}

test("the live dictionary opens for the selected store without a sample fallback", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  const about = page.getByRole("button", { name: "About this data", exact: true });
  test.skip((await about.count()) === 0, "No report sources remain");
  const response = page.waitForResponse((response) => response.url().includes("/data-dictionary?"));
  await about.click();
  const result = await response;
  expect(result.status()).toBe(200);
  const report = (await result.json()) as { mode: string; fields: unknown[] };
  expect(report.mode).toBe("live");
  expect(report.fields.length).toBeGreaterThan(0);
  const panel = page.getByRole("dialog", { name: "About this data", exact: true });
  await expect(panel.getByLabel("Search fields")).toBeVisible();
  await expect(panel).toContainText("Data freshness unknown");
  await expect(panel).not.toContainText("bundled schema snapshot");
});

test("dates follow the store's SourceMedium time zone", async ({ page }) => {
  await page.goto(appConfig.nav[0]?.href ?? "/");
  await expectLiveReport(page);
  const footer = page.locator("footer", { hasText: "store's time zone" });
  const zone = /store's time zone, (?:UTC(?=[+-]))?([^ ]+?)\./.exec((await footer.textContent()) ?? "")?.[1];
  if (!zone) throw new Error("The report footer does not name the store's time zone");
  const to = page.locator('input[name="to"]');
  test.skip((await to.count()) === 0, "The first view has no date range");
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: zone, year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(new Date())
    .reduce<Record<string, string>>((all, part) => ({ ...all, [part.type]: part.value }), {});
  await expect(to).toHaveAttribute("max", `${parts.year}-${parts.month}-${parts.day}`);
});

for (const item of appConfig.nav) {
  test(`${item.href} renders live data without errors`, async ({ page }) => {
    const problems = watchConsole(page);
    await page.goto(item.href);
    await expectLiveReport(page);
    expect(problems).toEqual([]);
  });
}

test("Overview summaries and exports work at each grain with a sales-channel filter", async ({ page, request }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/overview"), "no Overview view");
  const problems = watchConsole(page);
  await page.goto("/overview");
  await expectLiveReport(page);
  const channel = page.getByLabel("Sales channel", { exact: true });
  await expect(channel).toBeVisible({ timeout: 30_000 });
  const option = channel.locator('option:not([value=""])').first();
  const value = (await option.count()) ? await option.getAttribute("value") : null;
  if (value) {
    await channel.selectOption(value);
    await expect(page).toHaveURL(/sales_channel=/);
  }
  await expectLiveReport(page);
  expect(problems).toEqual([]);
  test.skip(
    await page.getByText("No rows match this store, sales channel, and date range.", { exact: true }).isVisible(),
    "No Overview rows in the selected period; summary interactions require rows",
  );
  for (const grain of ["week", "month"]) {
    await page.getByLabel("Summary rows", { exact: true }).selectOption(grain);
    await expect(page).toHaveURL(new RegExp(`grain=${grain}`));
    await expectLiveReport(page);
    await expect(page.getByRole("table", { name: "Business summary", exact: true })).toBeVisible();
    const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
    if (!href) throw new Error("Missing summary download");
    const response = await request.get(href);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toContain("text/csv");
    expect((await response.text()).split("\r\n")[0]).toContain('"row_type","period_from","period_to"');
  }
  expect(problems).toEqual([]);
});

test("Paid marketing can rank campaigns against the previous year", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/paid-marketing"), "no Paid marketing view");
  const problems = watchConsole(page);
  await page.goto("/paid-marketing?breakdown=campaign&compare=year");
  await expectLiveReport(page);
  await expect(
    page
      .getByRole("table", { name: "Spend by campaign details", exact: true })
      .or(page.getByText("No spend rows match these filters.", { exact: true })),
  ).toBeVisible();
  expect(problems).toEqual([]);
});

test("Products variants and retention cohorts render data or an explicit empty state", async ({ page }) => {
  if (appConfig.nav.some((item) => item.href === "/products")) {
    await page.goto("/products?dimension=variant&metric=units&compare=year");
    await expectLiveReport(page);
    await expect(
      page.getByRole("table", { name: "Net units by variant details", exact: true }).or(
        page.getByText("No valid-order product lines match this store, sales channel, and date range.", {
          exact: true,
        }),
      ),
    ).toBeVisible();
  }
  if (appConfig.nav.some((item) => item.href === "/retention")) {
    await page.goto("/retention");
    await expectLiveReport(page);
    await expect(
      page.getByRole("table", { name: "Monthly retention", exact: true }).or(emptyRetention(page)),
    ).toBeVisible();
  }
});

test("the store and dates survive navigation, and the next page of orders loads", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/orders"), "no Orders view");
  // The first page can be Retention (no date presets) or a customer's own page.
  await page.goto("/orders");
  await page.getByRole("link", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/store=.+&from=/);
  const selected = new URL(page.url()).searchParams;
  // Wait for the regions to load, so the next click does not cancel their queries.
  await expectLiveReport(page);
  const other = appConfig.nav.find((item) => item.href !== "/orders");
  if (other) {
    await page.locator('[data-slot="sidebar-menu"]').getByRole("link", { name: other.label, exact: true }).click();
    await expectLiveReport(page);
  }
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL(/\/orders\?store=/);
  const applied = new URL(page.url()).searchParams;
  expect(["store", "from", "to"].map((name) => applied.get(name))).toEqual(
    ["store", "from", "to"].map((name) => selected.get(name)),
  );
  await expectLiveReport(page);
  const older = page.getByRole("link", { name: "Older orders" });
  test.skip((await older.count()) === 0, "this store has one page of orders in the last 7 days");
  await older.click();
  await expect(page).toHaveURL(/cursor=/);
  await expectLiveReport(page);
  await expect(page.getByRole("link", { name: "Newest orders" })).toBeVisible();
});

test("channel controls apply available channels and retention renders its published state", async ({ page }) => {
  for (const [href, label] of [
    ["/products", "Sales channel"],
    ["/orders", "Sales channel"],
    ["/creatives", "Ad channel"],
  ]) {
    if (!appConfig.nav.some((item) => item.href === href)) continue;
    await page.goto(href as string);
    await expectLiveReport(page);
    const select = page.getByLabel(label as string, { exact: true });
    await expect(select).toBeVisible({ timeout: 30000 });
    const option = select.locator('option:not([value=""])').first();
    // Stores without sales or ad delivery legitimately have no channel options.
    if ((await option.count()) === 0) continue;
    const channel = await option.getAttribute("value");
    if (!channel) throw new Error("A published channel option is missing its value");
    await select.selectOption(channel);
    await expect(select).toHaveValue(channel);
    await expectLiveReport(page);
  }
  if (appConfig.nav.some((item) => item.href === "/retention")) {
    await page.goto("/retention?cohorts=earliest");
    await expectLiveReport(page);
    // The chart's accessible table also works when exact values cannot safely be plotted.
    await expect(
      page
        .getByRole("img", { name: "Gross profit LTV by cohort age chart", exact: true })
        .or(page.getByRole("table", { name: "Gross profit LTV by cohort age", exact: true }))
        .or(emptyRetention(page)),
    ).toBeVisible();
  }
});
