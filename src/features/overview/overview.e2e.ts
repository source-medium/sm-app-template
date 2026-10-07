import { expect, test } from "@playwright/test";
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
  await expect(chart.locator(".recharts-line-curve")).toBeVisible();
  await chart.locator(".recharts-surface").hover({ position: { x: 150, y: 100 } });
  const tooltip = chart.locator('[data-slot="chart-tooltip"]:visible');
  await expect(tooltip).toBeVisible();
  const value = tooltip.locator('[data-slot="chart-tooltip-value"]');
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
  const comparison = page.getByRole("region", { name: "Comparison period" });
  await expect(comparison).toContainText("Aug 25, 2026 – Aug 31, 2026");
  await expect(page.locator('[data-slot="kpi-comparison"]:visible')).toHaveCount(6);
  await page.getByLabel("Compare with").selectOption("year");
  await page.getByRole("button", { name: "Copy report link" }).click();
  await expect(page.getByText("Report link copied.", { exact: true })).toBeVisible();
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get("compare")).toBe(
    "previous",
  );
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/compare=year/);
  await expect(comparison).toContainText("Sep 1, 2025 – Sep 7, 2025");
  await page.reload();
  await expect(page.getByLabel("Compare with")).toHaveValue("year");
  await page.getByRole("button", { name: "Copy report link" }).click();
  await expect(page.getByText("Report link copied.", { exact: true })).toBeVisible();
  expect(new URL(await page.evaluate(() => navigator.clipboard.readText())).searchParams.get("compare")).toBe("year");
  await page.getByRole("button", { name: "Refresh data", exact: true }).click();
  await expect(page.getByLabel("Compare with")).toHaveValue("year");
  await page.getByRole("link", { name: "Last 7 days" }).click();
  await expect(page).toHaveURL(/compare=year/);
  await page.getByRole("link", { name: "Orders", exact: true }).click();
  await expect(page).toHaveURL(/compare=year/);
  await page.getByRole("link", { name: "Overview", exact: true }).click();
  await expect(page.getByLabel("Compare with")).toHaveValue("year");
  await page.getByLabel("Compare with").selectOption("off");
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/compare=off/);
  await expect(comparison).toHaveCount(0);
  await expect(page.locator('[data-slot="kpi-comparison"]:visible')).toHaveCount(0);
});

test("overview: calendar YoY explains different day counts across leap years", async ({ page }) => {
  await page.goto("/overview?from=2025-02-28&to=2025-03-01&compare=year");
  const comparison = page.getByRole("region", { name: "Comparison period" });
  await expect(comparison).toContainText("Feb 28, 2024 – Mar 1, 2024");
  await expect(comparison).toContainText("2 selected days vs 3 comparison days");
  await expect(comparison).toContainText("Calendar dates, not matched weekdays");
});

test("overview: metric definitions open and close by keyboard", async ({ page }) => {
  await page.goto("/overview");
  const definition = page.locator("details", { hasText: "Marketing efficiency (MER)" });
  await expect(definition.locator("summary")).toBeVisible();
  await definition.locator("summary").focus();
  await page.keyboard.press("Enter");
  await expect(definition.getByText(/Net revenue divided by ad spend/)).toBeVisible();
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

test("overview: chart labels and lines remain readable in both themes", async ({ page }) => {
  await page.goto("/overview");
  const chart = page.getByRole("img", { name: "Net revenue by day chart", exact: true });
  await expect(chart.locator(".recharts-line-curve")).toBeVisible();
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
  await expect(page.getByText("That store is not in this warehouse")).toBeVisible();
  await expect(page.getByLabel("Store")).toHaveValue("unknown-store");
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("href", /store=unknown-store/);
  await page.getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page).toHaveURL(/store=unknown-store/);
  await expect(page.getByText("That store is not in this warehouse")).toBeVisible();
  await page.getByLabel("Store").selectOption("sample-store-a");
  await expect(page).toHaveURL(/store=sample-store-a/);
  await expect(page.getByText("That store is not in this warehouse")).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Last 7 days" })).toHaveAttribute("href", /store=sample-store-a/);
});
