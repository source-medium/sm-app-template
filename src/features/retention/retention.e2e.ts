import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "../../../e2e/helpers";

test("retention: incomplete months, published gaps, and measure/channel selections remain explicit", async ({
  page,
}) => {
  await page.goto("/retention?store=sample-store-a&as_of=2026-09&channel=online_dtc");
  const table = page.getByRole("table", { name: "Monthly retention", exact: true });
  await expect(table).toBeVisible();
  await expect(table.locator('td[data-state="immature"]').first()).toHaveText("—");
  await expect(table.locator('td[data-state="missing"]').first()).toHaveText("No data");
  await expect(
    table.getByRole("row").filter({ has: page.getByRole("rowheader", { name: "Sep 2026", exact: true }) }),
  ).toContainText("100%");
  await page.getByLabel("Matrix measure", { exact: true }).selectOption("revenue");
  await expect(page).toHaveURL(/measure=revenue/);
  const revenue = page.getByRole("table", { name: "Cumulative revenue / customer (LTR)", exact: true });
  await expect(revenue).toBeVisible();
  const revenueValues = await revenue.locator('td[data-state="value"]').allTextContents();
  await page.getByLabel("Matrix measure", { exact: true }).selectOption("profit");
  await expect(page).toHaveURL(/measure=profit/);
  const profit = page.getByRole("table", { name: "Cumulative gross profit / customer (LTV)", exact: true });
  await expect(profit).toBeVisible();
  expect(await profit.locator('td[data-state="value"]').allTextContents()).not.toEqual(revenueValues);
  await page.getByLabel("Acquisition sales channel", { exact: true }).selectOption("amazon");
  await expect(page).toHaveURL(/channel=amazon/);
  expect(new URL(page.url()).searchParams.get("as_of")).toBe("2026-09");
  await page.getByLabel("Through completed month").fill("2026-08");
  await page.getByRole("button", { name: "Apply month", exact: true }).click();
  await expect(page).toHaveURL(/as_of=2026-08/);
  await expect(profit.getByRole("rowheader", { name: "Sep 2026", exact: true })).toHaveCount(0);
  await expect(page).toHaveTitle(/Retention/);
  await expectNoSeriousA11yViolations(page);
});

test("retention: an unknown channel is never silently replaced", async ({ page }) => {
  await page.goto("/retention?store=sample-store-b&channel=unknown&as_of=2026-09");
  await expect(page.getByText("No cohorts for this channel. Choose another acquisition sales channel.")).toBeVisible();
  await expect(page.getByLabel("Acquisition sales channel", { exact: true })).toHaveValue("unknown");
  await page.getByLabel("Acquisition sales channel", { exact: true }).selectOption("online_dtc");
  await expect(page.getByRole("table", { name: "Monthly retention", exact: true })).toBeVisible();
});

test("retention: separate retention and LTV curves share channel/window controls and accessible tables", async ({
  page,
}) => {
  await page.goto("/retention?store=sample-store-a&as_of=2026-09");
  const curves = page.getByRole("region", { name: "Retention and lifetime value curves", exact: true });
  const rate = page.getByRole("img", { name: "Retention by cohort age chart", exact: true });
  await expect(rate).toBeVisible();
  await expect(page.getByRole("img", { name: "Gross profit LTV by cohort age chart", exact: true })).toBeVisible();
  await expect(rate.getByText("100%", { exact: true })).toBeVisible();
  await page.getByLabel("Chart cohorts", { exact: true }).selectOption("earliest");
  await expect(page).toHaveURL(/cohorts=earliest/);
  await curves.getByRole("button", { name: "View as table", exact: true }).first().click();
  const retention = page.getByRole("table", { name: "Retention by cohort age", exact: true });
  await expect(retention.getByRole("columnheader", { name: "Jan 2026", exact: true })).toBeVisible();
  await expect(retention.getByRole("rowheader", { name: "Month 11", exact: true })).toBeVisible();
  await curves.getByRole("button", { name: "View as table", exact: true }).click();
  const ltv = page.getByRole("table", { name: "Gross profit LTV by cohort age", exact: true });
  await expect(ltv).toBeVisible();
  await expect(page).toHaveTitle(/Retention/);
  await expectNoSeriousA11yViolations(page);
  await page.getByLabel("Acquisition sales channel", { exact: true }).selectOption("amazon");
  await expect(page.getByLabel("Chart cohorts", { exact: true })).toHaveValue("earliest");
  expect(new URL(page.url()).searchParams.get("as_of")).toBe("2026-09");
  await expect(rate).toBeVisible();
});

test("retention: keyboard scrolling keeps cohort labels pinned on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/retention?as_of=2026-09");
  const scroller = page.getByRole("region", { name: "Monthly retention", exact: true });
  await scroller.focus();
  await expect(scroller).toBeFocused();
  const label = scroller.getByRole("rowheader").first();
  const before = await label.boundingBox();
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => scroller.evaluate((el) => el.scrollLeft)).toBeGreaterThan(0);
  const after = await label.boundingBox();
  expect(Math.abs((after?.x ?? 0) - (before?.x ?? 0))).toBeLessThanOrEqual(1);
});
