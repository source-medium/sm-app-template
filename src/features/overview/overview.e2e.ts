import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "../../../e2e/helpers";

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
