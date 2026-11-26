import { expect, test } from "@playwright/test";
import { choose, expectNoSeriousA11yViolations, openDates } from "../../../e2e/helpers";
import { SAVED_REPORTS_KEY } from "@/lib/saved-reports";

for (const ranking of ["gainers", "decliners"]) {
  test(`products: ${ranking} changes use the ranking's first comparison even with a retained second baseline`, async ({
    page,
  }) => {
    await page.goto(`/products?store=sample-store-a&from=2026-09-01&to=2026-09-07&ranking=${ranking}&baseline=b`);
    await expect(
      page
        .getByRole("table", { name: "Net revenue by product details", exact: true })
        .getByRole("columnheader", { name: /^Change vs / }),
    ).toContainText("Change vs previous 7 days");
    await expect(page.getByRole("group", { name: "Comparison shown in charts and tables" })).toHaveCount(0);
  });
}

test("products: photo links preserve report scope and ranked values stay beside their identity on phones", async ({
  page,
}) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(
    "/products?store=sample-store-a&range=last-7-days&sales_channel=online_dtc&dimension=variant&metric=units",
  );
  await expect(page.getByRole("button", { name: /^Filters:/ })).toHaveAttribute("aria-expanded", "false");
  const table = page.getByRole("table", { name: "Net units by variant details", exact: true });
  await expect(table.getByRole("columnheader", { name: "Variant", exact: true })).toBeVisible();
  const change = table.locator('td[data-mobile-label^="Change vs"]').first();
  const before = await change.getAttribute("data-mobile-label");
  expect(before).toMatch(/^Change vs /);
  await page.getByRole("group", { name: "Comparison shown in charts and tables" }).getByRole("button").nth(1).click();
  await expect(change).not.toHaveAttribute("data-mobile-label", before ?? "");
  const link = table.getByRole("link").first();
  const scroller = page.getByRole("region", { name: "Net units by variant details", exact: true });
  const identity = table.locator("tbody tr").first().locator("td").first();
  await identity.scrollIntoViewIfNeeded();
  await expect(identity).toBeInViewport();
  expect(await scroller.evaluate((node) => node.scrollWidth)).toBeLessThanOrEqual(
    await scroller.evaluate((node) => node.clientWidth),
  );
  await link.locator("img").click();
  await expect(page).toHaveURL((url) => url.searchParams.has("entity"));
  const params = new URL(page.url()).searchParams;
  expect(params.get("range")).toBe("last-7-days");
  expect(params.get("sales_channel")).toBe("online_dtc");
  expect(params.get("dimension")).toBe("variant");
  expect(params.get("metric")).toBe("units");
});

test("products: browser-saved views restore rolling filters, survive reload and can be removed", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&range=last-7-days&metric=units&compare=year");
  // An edited date draft is not part of the applied view.
  await openDates(page);
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  await page.getByRole("button", { name: "Share", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Share this view", exact: true });
  await dialog.getByLabel("Save in this browser as", { exact: true }).fill("Weekly units");
  await dialog.getByRole("button", { name: "Save", exact: true }).click();
  await expect(dialog.getByRole("status")).toHaveText("Saved. Find it under Saved views in the sidebar.");
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), SAVED_REPORTS_KEY);
  const url = new URL(saved[0].href, page.url());
  expect(url.searchParams.get("range")).toBe("last-7-days");
  expect(url.searchParams.get("metric")).toBe("units");
  expect(url.searchParams.has("from")).toBe(false);
  expect(url.searchParams.has("to")).toBe(false);
  await page.keyboard.press("Escape");
  await page.reload();
  await choose(page, "Rank by", "revenue");
  await expect(page).toHaveURL((url) => url.searchParams.get("metric") === "revenue");
  // Saved views are places to go, so the sidebar lists them.
  const savedViews = page.getByRole("list", { name: "Saved views" });
  await savedViews.getByRole("link", { name: /^Weekly units/ }).click();
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("metric") === "units" && url.searchParams.get("range") === "last-7-days",
  );
  await expect(page.getByRole("table", { name: "Net units by product details", exact: true })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await expect(savedViews.getByRole("link", { name: /^Weekly units/ })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBe(0);
  await expectNoSeriousA11yViolations(page);
  await savedViews.getByRole("button", { name: "Remove Weekly units", exact: true }).click();
  await expect(savedViews).toHaveCount(0);
  expect(await page.evaluate((key) => JSON.parse(localStorage.getItem(key) ?? "[]"), SAVED_REPORTS_KEY)).toEqual([]);
});

test("products: catalog photos load and an image outage leaves totals and detail links usable", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-07");
  const table = page.getByRole("table", { name: "Net revenue by product details", exact: true });
  await table.scrollIntoViewIfNeeded();
  await expect
    .poll(() =>
      table
        .locator("img")
        .first()
        .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0),
    )
    .toBe(true);
  const totals = await page
    .getByRole("region", { name: "All product totals" })
    .locator('[data-slot="kpi-value"]')
    .allTextContents();
  let failedImages = 0;
  await page.route("**/sample-products/*", async (route) => {
    failedImages++;
    await route.abort();
  });
  await page.reload();
  await table.scrollIntoViewIfNeeded();
  await expect.poll(() => failedImages).toBeGreaterThan(0);
  await expect(table.locator("img")).toHaveCount(0);
  expect(
    await page.getByRole("region", { name: "All product totals" }).locator('[data-slot="kpi-value"]').allTextContents(),
  ).toEqual(totals);
  await expect(table.getByRole("link").first()).toBeVisible();
  await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
});

test("products: charts, tooltips and tables name products plainly", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28");
  const chart = page.getByRole("img", { name: "Net revenue by product chart", exact: true });
  await expect(chart.getByText("Sample pack", { exact: true })).toBeVisible();
  await expect(chart).not.toContainText("shopify");
  await chart.locator(".recharts-bar-rectangle").first().hover();
  const tooltip = chart.locator('[data-slot="chart-tooltip"]');
  await expect(tooltip).toContainText("Sample pack");
  await expect(tooltip).not.toContainText("shopify");
  await page.getByRole("button", { name: "View as table", exact: true }).click();
  const chartTable = page.getByRole("table", { name: "Net revenue by product", exact: true });
  await expect(chartTable).toContainText("Sample pack");
  await expect(chartTable).not.toContainText("shopify");
  await expect(page.getByRole("button", { name: "View as table", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "View as chart", exact: true }).click();
  await expect(chart).toBeVisible();
});

test("products: diagnostics appear only for the relevant ranking", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28");
  const costs = page.getByRole("region", { name: "Product cost coverage", exact: true });
  const refunds = page.getByRole("region", { name: "Product refund rate", exact: true });
  await expect(page.getByRole("table", { name: "Net revenue by product details", exact: true })).toBeVisible();
  await expect(costs).toHaveCount(0);
  await expect(refunds).toHaveCount(0);
  await choose(page, "Rank by", "profit");
  await expect(costs).toContainText("lines with missing published cost");
  await expect(refunds).toHaveCount(0);
  await choose(page, "Rank by", "refunds");
  await expect(page.getByRole("table", { name: "Refund amount by product details", exact: true })).toBeVisible();
  await expect(costs).toHaveCount(0);
  await expect(refunds).toContainText("refunded units /");
  await choose(page, "Rank by", "refunded_units");
  await expect(page).toHaveURL(/metric=refunded_units/);
  await expect(page.getByRole("table", { name: "Refunded units by product details", exact: true })).toBeVisible();
  await expect(
    page.getByRole("region", { name: "All product totals", exact: true }).locator('[data-slot="kpi-value"]'),
  ).toHaveCount(2);
  await expect(refunds).toBeVisible();
  await choose(page, "Rank by", "units");
  await expect(page.getByRole("table", { name: "Net units by product details", exact: true })).toBeVisible();
  await expect(costs).toHaveCount(0);
  await expect(refunds).toHaveCount(0);
});

test("products: ranking and variant filters preserve comparison dates and full totals", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-07&compare=year");
  const totals = page.getByRole("region", { name: "All product totals" });
  await expect(totals).toBeVisible();
  const before = await totals.locator('[data-slot="kpi-value"]').allTextContents();
  await choose(page, "Group by", "variant");
  await expect(page).toHaveURL(/dimension=variant/);
  await choose(page, "Rank by", "units");
  await expect(page).toHaveURL(/metric=units/);
  await expect(page.getByRole("table", { name: "Net units by variant details", exact: true })).toBeVisible();
  expect(await totals.locator('[data-slot="kpi-value"]').allTextContents()).toEqual(before);
  expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
  // The table lists every match past the chart's first 10.
  await expect(page.getByText("1–24 of 24", { exact: true })).toBeVisible();
  await expect(
    page.getByRole("table", { name: "Net units by variant details", exact: true }).locator("tbody tr"),
  ).toHaveCount(24);
  await choose(page, "Compare with", "off");
  await expect(page).toHaveURL(/compare=off/);
  await expect(page.getByRole("columnheader", { name: "Change vs comparison" })).toHaveCount(0);
});

test("products: sales-channel scope changes totals and survives the other controls", async ({ page }) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28&compare=year");
  const totals = page.getByRole("region", { name: "All product totals" }).locator('[data-slot="kpi-value"]');
  await expect(totals).toHaveCount(2);
  const all = await totals.allTextContents();
  await choose(page, "Sales channel", "amazon");
  await expect(page).toHaveURL(/sales_channel=amazon/);
  await expect(totals.first()).not.toHaveText(all[0] ?? "");
  await choose(page, "Group by", "variant");
  await expect(page).toHaveURL(/dimension=variant/);
  await choose(page, "Rank by", "profit");
  await expect(page).toHaveURL(/metric=profit/);
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("amazon");
  expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
  await page.goto("/products?store=sample-store-a&sales_channel=unknown");
  await expect(
    page.getByText("No valid-order product lines match this store, sales channel, and date range."),
  ).toBeVisible();
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("unknown");
  await choose(page, "Sales channel", "");
  await expect(totals).toHaveCount(2);
});

test("phone rankings show each complete change amount inside the table frame", async ({ page }) => {
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28&compare=previous");
    const table = page.getByRole("table", { name: "Net revenue by product details" });
    const changes = table.locator('td[data-mobile-label^="Change"]');
    await expect(changes.first()).toBeVisible();
    expect(
      await changes.evaluateAll((cells) =>
        cells.every((cell) => {
          const frame = cell.closest('[data-slot="table-container"]')?.getBoundingClientRect();
          const range = document.createRange();
          range.selectNodeContents(cell);
          const text = range.getBoundingClientRect();
          return !!frame && text.width > 0 && text.left >= frame.left && text.right <= frame.right;
        }),
      ),
    ).toBe(true);
  }
});

test("products: the search narrows the ranked list, never the totals, and the CSV exports the same rows", async ({
  page,
}) => {
  await page.goto("/products?store=sample-store-a&from=2026-09-01&to=2026-09-28");
  const totals = page.getByRole("region", { name: "All product totals" });
  const table = page.getByRole("table", { name: "Net revenue by product details", exact: true });
  await expect(table.locator("tbody tr").first()).toBeVisible();
  const before = await totals.locator('[data-slot="kpi-value"]').allTextContents();
  const everyRow = await table.locator("tbody tr").count();
  await page.getByRole("searchbox", { name: "Find a product" }).fill("BLEND");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL((url) => url.searchParams.get("q") === "BLEND");
  await expect(table.locator("tbody tr").first()).toBeVisible();
  const names = await table.locator("tbody tr td:first-child").allInnerTexts();
  expect(names.length).toBeGreaterThan(0);
  expect(names.length).toBeLessThan(everyRow);
  for (const name of names) expect(name.toLowerCase()).toContain("blend");
  expect(await totals.locator('[data-slot="kpi-value"]').allTextContents()).toEqual(before);
  await expect(page.getByRole("searchbox", { name: "Find a product" })).toHaveValue("BLEND");

  const download = page.getByRole("link", { name: "Download CSV" });
  const href = await download.getAttribute("href");
  expect(href).toMatch(/^\/products\/export\?/);
  const csv = await (await page.request.get(href ?? "")).text();
  // Every cell is quoted, and these rows hold no quotes or commas.
  const [columns = [], ...lines] = csv
    .trim()
    .split("\r\n")
    .map((line) => line.slice(1, -1).split('","'));
  expect(columns).toEqual(expect.arrayContaining(["export_truncated", "search", "product", "net_revenue"]));
  expect(lines).toHaveLength(names.length);
  const truncated = columns.indexOf("export_truncated");
  const search = columns.indexOf("search");
  for (const cells of lines) {
    expect(cells[truncated]).toBe("false");
    expect(cells[search]).toBe("BLEND");
  }

  // Another control keeps the applied search and starts again from the first page.
  await choose(page, "Rank by", "Net units");
  await expect(page).toHaveURL((url) => url.searchParams.get("metric") === "units");
  expect(new URL(page.url()).searchParams.get("q")).toBe("BLEND");

  await page.getByRole("searchbox", { name: "Find a product" }).fill("no such product");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText(/No products match “no such product”/)).toBeVisible();
  await page.getByRole("link", { name: "Clear the search" }).click();
  await expect(page).toHaveURL((url) => !url.searchParams.has("q"));
  await expect(
    page.getByRole("table", { name: "Net units by product details", exact: true }).locator("tbody tr"),
  ).toHaveCount(everyRow);
});
