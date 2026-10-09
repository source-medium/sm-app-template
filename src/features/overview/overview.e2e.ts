import { expect, test } from "@playwright/test";
import { appConfig } from "@/app.config";
import { expectNoSeriousA11yViolations, expectTextContained } from "../../../e2e/helpers";

test("overview: full money values and comparison text stay inside their cards", async ({ page }) => {
  await page.goto("/overview");
  await expect(page.locator('[data-slot="kpi-value"]:visible')).toHaveCount(6);
  // Exercise the layout with a valid large NUMERIC display, independently of the sample's small totals.
  await page
    .locator('[data-slot="kpi-value"]')
    .first()
    .evaluate((node) => {
      node.textContent = "$12,345,678,901,234,567,890.12";
    });
  await page
    .locator('[data-slot="kpi-comparison"]')
    .first()
    .evaluate((node) => {
      const display = node.querySelector("span span");
      if (!display) throw new Error("Missing change text");
      display.textContent = "+$1,234,567,890,123,456.78 (+123.45%)";
    });
  for (const width of [320, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectTextContained(page.locator('[data-slot="kpi-value"]:visible, [data-slot="kpi-comparison"]:visible'));
  }
  await expect(page.locator('[data-slot="kpi-value"]').first()).toHaveText("$12,345,678,901,234,567,890.12");
});

test("overview: a chart tooltip separates its label and formatted money", async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 900 });
  await page.goto("/overview");
  const chart = page.getByRole("img", { name: "Net revenue by day chart", exact: true });
  await expect(chart.locator(".recharts-line-curve").first()).toBeVisible();
  await chart.locator(".recharts-surface").hover({ position: { x: 150, y: 100 } });
  const tooltip = chart.locator('[data-slot="chart-tooltip"]:visible');
  await expect(tooltip).toBeVisible();
  const value = tooltip.locator('[data-slot="chart-tooltip-value"]').first();
  await expect(value).toHaveText(/\d[\d,]*\.\d{2}/);
  const labelBounds = await tooltip.getByText("Net revenue", { exact: true }).boundingBox();
  const valueBounds = await value.boundingBox();
  if (!labelBounds || !valueBounds) throw new Error("Missing tooltip content");
  expect(valueBounds.x - labelBounds.x - labelBounds.width).toBeGreaterThanOrEqual(8);
  await expectTextContained(tooltip);
});

test("overview: period and year comparisons survive links, navigation, and refresh", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/overview?store=sample-store-a&from=2026-09-01&to=2026-09-07");
  const comparison = page.locator('details[aria-label="Comparison period"]');
  await expect(comparison).toContainText("Aug 25, 2026 – Aug 31, 2026");
  await expect(page.locator('[data-slot="kpi-comparison"]:visible')).toHaveCount(6);
  await page.getByLabel("Compare with").selectOption("year");
  await expect(page).toHaveURL(/compare=year/);
  await page.getByRole("button", { name: "Copy report link" }).click();
  await expect(page.getByText("Report link copied.", { exact: true })).toBeVisible();
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get("compare")).toBe("year");
  await expect(comparison).toContainText("Sep 1, 2025 – Sep 7, 2025");
  await page.reload();
  await expect(page.getByLabel("Compare with")).toHaveValue("year");
  await page.getByRole("button", { name: "Copy report link" }).click();
  await expect(page.getByText("Report link copied.", { exact: true })).toBeVisible();
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get("compare")).toBe("year");
  const refresh = page.getByRole("button", { name: "Refresh data", exact: true });
  await refresh.click();
  await expect(refresh).toBeEnabled();
  await expect(page.getByLabel("Compare with")).toHaveValue("year");
  const preset = page.getByRole("link", { name: "Last 7 days" });
  const presetHref = await preset.getAttribute("href");
  if (!presetHref) throw new Error("Missing date preset link");
  await preset.click();
  await expect(page).toHaveURL(presetHref);
  const other = appConfig.nav.find((item) => item.href !== "/overview");
  if (other) {
    await page.getByRole("link", { name: other.label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${other.href}\\?`));
    expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page).toHaveURL(/\/overview\?/);
  }
  await expect(page.getByLabel("Compare with")).toHaveValue("year");
  await page.getByLabel("Compare with").selectOption("off");
  await expect(page).toHaveURL(/compare=off/);
  await expect(comparison).toHaveCount(0);
  await expect(page.locator('[data-slot="kpi-comparison"]:visible')).toHaveCount(0);
});

test("overview: calendar YoY explains different day counts across leap years", async ({ page }) => {
  await page.goto("/overview?from=2025-02-28&to=2025-03-01&compare=year");
  const comparison = page.locator('details[aria-label="Comparison period"]');
  await expect(comparison).toContainText("Feb 28, 2024 – Mar 1, 2024");
  await expect(comparison).toContainText("2 selected days vs 3 comparison days");
  await expect(comparison).toContainText("Calendar dates, not matched weekdays");
});

test("overview: metric definitions open and close by keyboard", async ({ page }) => {
  await page.goto("/overview");
  const definition = page
    .locator("details")
    .filter({ has: page.locator("summary", { hasText: "Marketing efficiency (MER)" }) });
  await expect(definition.locator("summary")).toBeVisible();
  await definition.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(definition.getByText(/Net revenue divided by ad spend/)).toBeVisible();
  await expect(page).toHaveTitle(/Overview/);
  await expectNoSeriousA11yViolations(page);
  await page.keyboard.press("Enter");
  await expect(definition.getByText(/Net revenue divided by ad spend/)).toBeHidden();
});

test("overview: a chart opens as an accessible table", async ({ page }) => {
  await page.goto("/overview");
  const card = page.locator('[data-slot="card"]', { hasText: "Summary orders by day" });
  await card.getByRole("button", { name: "View as table" }).click();
  await expect(card.getByRole("table", { name: "Summary orders by day" })).toBeVisible();
  await expect(card.getByRole("columnheader", { name: "Summary orders" })).toBeVisible();
});

test("overview: KPI trends expose daily values and purchase measures follow filters and comparisons", async ({
  page,
}) => {
  await page.goto("/overview?store=sample-store-a&from=2026-09-01&to=2026-09-07&compare=previous&grain=week");
  const totals = page.getByRole("region", { name: "Period totals", exact: true });
  await expect(totals.getByRole("img")).toHaveCount(6);
  await totals.getByRole("link", { name: "View daily values for Net revenue", exact: true }).click();
  await expect(page).toHaveURL(/grain=day#summary-heading$/);
  const daily = page.getByRole("table", { name: "Business summary", exact: true });
  await expect(daily).toBeVisible();
  await expect(daily.getByRole("row")).toHaveCount(9);
  await expect(daily.getByRole("cell", { name: "Sep 1, 2026", exact: true })).toBeVisible();
  await expect(daily.getByRole("columnheader", { name: "Revenue / summary order", exact: true })).toBeVisible();
  const purchases = page.getByRole("table", { name: "New vs repeat purchases", exact: true });
  await expect(purchases.getByRole("columnheader", { name: "Revenue change", exact: true })).toBeVisible();
  const first = purchases.getByRole("row").filter({ hasText: "New-customer orders" });
  const revenueText = await first.getByRole("cell").nth(1).innerText();
  // selectOption sets the value programmatically, even while inert blocks real pointer/keyboard input.
  await expect(page.getByLabel("Sales channel", { exact: true })).not.toHaveAttribute("inert");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("Amazon");
  await expect(page).toHaveURL(/sales_channel=Amazon/);
  await expect(first.getByRole("cell").nth(1)).not.toHaveText(revenueText);
  await page.getByLabel("Compare with").selectOption("off");
  await expect(purchases.getByRole("columnheader", { name: "Revenue change", exact: true })).toHaveCount(0);
  await expect(totals.getByRole("img")).toHaveCount(6);
  await expect(page).toHaveTitle(/Overview/);
  await expectNoSeriousA11yViolations(page);
});

test("overview: chart labels and lines remain readable in both themes", async ({ page }) => {
  await page.goto("/overview");
  const chart = page.getByRole("img", { name: "Net revenue by day chart", exact: true });
  await expect(chart.locator(".recharts-line-curve").first()).toBeVisible();
  for (const theme of ["light", "dark"]) {
    await page.getByLabel("Appearance").selectOption(theme);
    const contrast = await chart.evaluate((element) => {
      function luminance(color: string) {
        const [r, g, b] = (color.match(/[\d.]+/g) ?? []).map((channel) => {
          const value = Number(channel) / 255;
          return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        });
        if (r === undefined || g === undefined || b === undefined) throw new Error(`Expected RGB: ${color}`);
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      }
      const card = element.closest('[data-slot="card"]');
      if (!card) throw new Error("The chart must have a card background");
      const background = luminance(getComputedStyle(card).backgroundColor);
      function ratio(color: string) {
        const foreground = luminance(color);
        return (Math.max(foreground, background) + 0.05) / (Math.min(foreground, background) + 0.05);
      }
      return {
        labels: [...element.querySelectorAll("text")].map((label) => ratio(getComputedStyle(label).fill)),
        lines: [...element.querySelectorAll(".recharts-line-curve")].map((line) =>
          ratio(getComputedStyle(line).stroke),
        ),
      };
    });
    expect(contrast.labels.length).toBeGreaterThan(0);
    for (const ratio of contrast.labels) expect(ratio, `${theme} chart label`).toBeGreaterThanOrEqual(4.5);
    for (const ratio of contrast.lines) expect(ratio, `${theme} chart line`).toBeGreaterThanOrEqual(3);
  }
});

test("unknown stores remain unselected until the viewer chooses a valid store", async ({ page }) => {
  await page.goto("/overview?store=unknown-store");
  await expect(page.getByText("This store is not in the store list")).toBeVisible();
  await expect(page.getByLabel("Store")).toHaveValue("unknown-store");
  await expect(page.locator('[data-slot="kpi-value"]')).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("href", /store=unknown-store/);
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/store=unknown-store/);
  await expect(page.getByText("This store is not in the store list")).toBeVisible();
  await page.getByLabel("Store").selectOption("sample-store-a");
  await expect(page).toHaveURL(/store=sample-store-a/);
  await expect(page.getByText("This store is not in the store list")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("href", /store=sample-store-a/);
});

test("overview: comparison dates and the dashed baseline survive the table toggle", async ({ page }) => {
  await page.goto("/overview?store=sample-store-a&from=2026-09-02&to=2026-09-08&compare=previous");
  const card = page.locator('[data-slot="card"]', { hasText: "Net revenue by day" });
  await expect(card.locator('.recharts-line-curve[stroke-dasharray="6 4"]')).toBeVisible();
  await card.getByRole("button", { name: "View as table" }).click();
  await expect(card.getByRole("columnheader", { name: "Comparison", exact: true })).toBeVisible();
  await expect(card.getByRole("cell").filter({ hasText: "Aug 26, 2026" })).toBeVisible();
  await page.getByLabel("Compare with").selectOption("off");
  await expect(page).toHaveURL(/compare=off/);
  await expect(card.locator('.recharts-line-curve[stroke-dasharray="6 4"]')).toHaveCount(0);
});

test("overview: channel and grain filter the summary and raw export together", async ({ page, request }) => {
  await page.goto("/overview?store=sample-store-a&from=2026-09-02&to=2026-09-08&compare=year");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("Amazon");
  await expect(page).toHaveURL(/sales_channel=Amazon/);
  await page.getByLabel("Summary rows", { exact: true }).selectOption("week");
  await expect(page).toHaveURL(/grain=week/);
  expect(new URL(page.url()).searchParams.get("compare")).toBe("year");
  const table = page.getByRole("table", { name: "Business summary", exact: true });
  await expect(table.getByRole("cell", { name: "Sep 2, 2026 – Sep 6, 2026", exact: true })).toBeVisible();
  await expect(table.getByRole("rowheader", { name: "Selected period total" })).toBeVisible();
  const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  if (!href) throw new Error("Missing summary download");
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  const response = await request.get(href);
  expect(response.status()).toBe(200);
  const lines = (await response.text()).trimEnd().split("\r\n");
  expect(lines).toHaveLength(4);
  expect(lines[0]).toContain('"row_type","period_from","period_to","net_revenue"');
  expect(lines[1]).toContain('"Amazon","week","period","2026-09-02","2026-09-06"');
  expect(lines[3]).toContain('"Amazon","week","total","2026-09-02","2026-09-08"');
  await expect(page).toHaveTitle(/Overview/);
  await expectNoSeriousA11yViolations(page);
});

test("overview: an unknown channel stays explicit and can be reset", async ({ page }) => {
  await page.goto("/overview?store=sample-store-a&sales_channel=unknown");
  await expect(page.getByText("No rows match this store, sales channel, and date range.")).toBeVisible();
  await expect(page.getByLabel("Sales channel", { exact: true })).toHaveValue("unknown");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("");
  await expect(page.getByRole("table", { name: "Business summary", exact: true })).toBeVisible();
});

test("overview: date and channel drafts apply together, and invalid ranges never silently change", async ({ page }) => {
  await page.goto("/overview?store=sample-store-a&from=2026-09-09&to=2026-09-28");
  await page.getByLabel("From", { exact: true }).fill("2026-09-01");
  await expect(page).toHaveURL(/from=2026-09-09/);
  await page.getByLabel("Sales channel", { exact: true }).selectOption("Amazon");
  await expect(page).toHaveURL(
    (url) => url.searchParams.get("from") === "2026-09-01" && url.searchParams.get("sales_channel") === "Amazon",
  );
  await page.getByLabel("From", { exact: true }).fill("2026-09-30");
  await page.getByLabel("Sales channel", { exact: true }).selectOption("");
  await expect(page.getByRole("main").getByRole("alert")).toContainText("start date must be on or before");
  await expect(page).toHaveURL(/from=2026-09-01/);
  await expect(page.getByLabel("From", { exact: true })).toBeFocused();
  await page.getByLabel("From", { exact: true }).fill("2026-01-01");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toContainText("90 days or fewer");
  for (const dates of ["from=2026-09-30&to=2026-09-01", "from=2026-01-01&to=2026-09-30", "from=bad&to=bad"]) {
    await page.goto(`/overview?store=sample-store-a&${dates}`);
    await expect(page.getByRole("main").getByRole("alert")).toContainText("Check the date range");
    await expect(page.locator('[data-slot="kpi-value"]')).toHaveCount(0);
  }
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("main").getByRole("alert")).toHaveCount(0);
  await expect(page.locator('[data-slot="kpi-value"]')).toHaveCount(6);
});

test("overview: the first KPI and full-width chart notes are readable on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/overview");
  const value = page.locator('[data-slot="kpi-value"]').first();
  await expect(value).toBeVisible();
  const bounds = await value.boundingBox();
  expect(bounds?.y).toBeLessThan(844);
  const card = page.locator('[data-slot="card"]', { hasText: "Net revenue by day" });
  const description = await card.locator('[data-slot="card-description"]:visible').boundingBox();
  const header = await card.locator('[data-slot="card-header"]:visible').boundingBox();
  expect(description?.width).toBeGreaterThan((header?.width ?? 0) * 0.7);
});

test("overview: the agent prompt identifies a KPI and an invalid date state", async ({ page }) => {
  await page.goto("/overview");
  await page.locator('[data-agent-target="Net revenue"]').waitFor();
  await page.getByRole("button", { name: "Ask a coding agent" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Target", { exact: true }).selectOption({ label: "Net revenue (KPI)" });
  await expect(dialog.getByLabel("Prompt", { exact: true })).toHaveValue(/Component: "KpiCard"/);
  await page.keyboard.press("Escape");
  await page.goto("/overview?from=invalid&to=invalid");
  await page.getByRole("button", { name: "Ask a coding agent" }).click();
  const prompt = await page.getByRole("dialog").getByLabel("Prompt", { exact: true }).inputValue();
  expect(prompt).toContain("Report not loaded: Choose a valid start and end date.");
  expect(prompt).not.toContain("from=");
  expect(prompt).not.toContain("to=");
});
