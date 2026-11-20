import { expect, test } from "@playwright/test";
import { SAMPLE_CAMPAIGN_NAMES } from "@/lib/sample/ad-names";

test("paid marketing: long campaign labels fit the ranking and retain their full identity", async ({ page }) => {
  const name = SAMPLE_CAMPAIGN_NAMES["cmp-1003"];
  const identity = `${name} (meta_ads / cmp-1003)`;
  const names = JSON.stringify([{ field: "campaign", operator: "contains", values: [name] }]);
  await page.goto(
    `/paid-marketing?store=sample-store-a&from=2026-09-01&to=2026-09-07&compare=off&breakdown=campaign&names=${encodeURIComponent(names)}`,
  );
  const chart = page.getByRole("img", { name: "Spend by campaign chart", exact: true });
  const category = chart.locator(".recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value");
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(category).toHaveCount(1);
    await expect
      .poll(() =>
        category.evaluate((tick) => {
          const bounds = tick.getBoundingClientRect();
          const card = tick.closest('[data-slot="chart"]')?.getBoundingClientRect();
          const bar = tick.closest("svg")?.querySelector(".recharts-bar-rectangle")?.getBoundingClientRect();
          return !!card && !!bar && bounds.width > 0 && bounds.left >= card.left && bounds.right <= bar.left;
        }),
      )
      .toBe(true);
    const label = category.getByTitle(identity, { exact: true });
    await expect(label).toHaveText(identity);
    expect(
      await label.evaluate((node) => {
        const lineHeight = Number.parseFloat(getComputedStyle(node).lineHeight);
        return node.clientHeight > 0 && node.clientHeight <= 2 * lineHeight && node.scrollHeight > node.clientHeight;
      }),
    ).toBe(true);

    await chart.locator(".recharts-bar-rectangle").first().hover();
    const tooltip = chart.locator('[data-slot="chart-tooltip"]');
    await expect(tooltip).toContainText(identity);
    expect(
      await tooltip.evaluate((node) => {
        const bounds = node.getBoundingClientRect();
        return bounds.left >= 0 && bounds.right <= window.innerWidth && node.scrollWidth <= node.clientWidth;
      }),
    ).toBe(true);
  }
  await page
    .getByRole("group", { name: "Spend by campaign display" })
    .getByRole("button", { name: "View as table" })
    .click();
  await expect(
    page
      .getByRole("table", { name: "Spend by campaign", exact: true })
      .getByRole("rowheader", { name: identity, exact: true }),
  ).toBeVisible();
});
