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
  await page.getByLabel("Cohort measure").selectOption("revenue");
  await expect(page).toHaveURL(/measure=revenue/);
  const revenue = page.getByRole("table", { name: "Cumulative revenue / customer (LTR)", exact: true });
  await expect(revenue).toBeVisible();
  const revenueValues = await revenue.locator('td[data-state="value"]').allTextContents();
  await page.getByLabel("Cohort measure").selectOption("profit");
  await expect(page).toHaveURL(/measure=profit/);
  const profit = page.getByRole("table", { name: "Cumulative gross profit / customer (LTV)", exact: true });
  await expect(profit).toBeVisible();
  expect(await profit.locator('td[data-state="value"]').allTextContents()).not.toEqual(revenueValues);
  await page.getByLabel("Acquisition sales channel").selectOption("amazon");
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
  await expect(page.getByLabel("Acquisition sales channel")).toHaveValue("unknown");
  await page.getByLabel("Acquisition sales channel").selectOption("online_dtc");
  await expect(page.getByRole("table", { name: "Monthly retention", exact: true })).toBeVisible();
});
