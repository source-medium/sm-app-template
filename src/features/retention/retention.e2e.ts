import { expect, test } from "@playwright/test";
import { switchStore } from "../../../e2e/helpers";

test("retention: long segment values and search controls stay usable on a small phone", async ({ page }, testInfo) => {
  await page.setViewportSize({ width: 320, height: 740 });
  const params = new URLSearchParams({
    store: "sample-store-a",
    as_of: "2026-09",
    acquisition_dimension: "campaign",
    acquisition_segment: "Long campaign ".repeat(30),
  });
  await page.goto(`/retention?${params}`);
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).toHaveValue(
    params.get("acquisition_segment") ?? "",
  );
  await expect(page.getByLabel("Matrix measure", { exact: true })).toBeVisible();
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth))
    .toBe(0);
  await page.getByRole("combobox", { name: "Acquisition segment", exact: true }).selectOption("Prospecting");
  await expect(page.getByRole("table", { name: "Monthly retention", exact: true })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath("foundation-retention-phone.png"), fullPage: true });
});

test("retention: switching stores keeps the dimension and month but clears private segment context", async ({
  page,
}) => {
  await page.goto(
    "/retention?store=sample-store-a&as_of=2026-09&acquisition_dimension=campaign&acquisition_segment=Prospecting&segment_search=prospect",
  );
  await expect(page.getByRole("table", { name: "Monthly retention", exact: true })).toBeVisible();
  await switchStore(page, "sample-store-b");
  const params = new URL(page.url()).searchParams;
  expect(params.get("acquisition_segment")).toBeNull();
  expect(params.get("segment_search")).toBeNull();
  expect(params.get("acquisition_dimension")).toBe("campaign");
  expect(params.get("as_of")).toBe("2026-09");
  await expect(page.getByText("Choose a segment to load its cohorts", { exact: true })).toBeVisible();
});

test("retention: acquisition segments are explicit, searchable, shareable and reset with their dimension", async ({
  page,
}) => {
  await page.goto("/retention?store=sample-store-a&as_of=2026-09&measure=second");
  await page.getByLabel("Segment cohorts by", { exact: true }).selectOption("campaign");
  await expect(page.getByText("Choose a segment to load its cohorts", { exact: true })).toBeVisible();
  // selectOption can change a streamed select while inert still blocks real user input.
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).not.toHaveAttribute("inert");
  await page.getByRole("combobox", { name: "Acquisition segment", exact: true }).selectOption("Prospecting");
  await expect(page.getByRole("table", { name: "Purchased a second time", exact: true })).toBeVisible();
  await page.getByRole("searchbox", { name: "Find a segment", exact: true }).fill("brand");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).toHaveValue("Prospecting");
  await page.getByRole("combobox", { name: "Acquisition segment", exact: true }).selectOption("Brand search");
  await expect(page).toHaveURL(/acquisition_segment=Brand(?:\+|%20)search/);
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).toHaveValue("Brand search");
  const context = JSON.parse((await page.locator("main [data-agent-page]").getAttribute("data-agent-page")) ?? "{}");
  expect(context.filters.acquisition_dimension).toBe("campaign");
  expect(context.filters.acquisition_segment).toBeUndefined();
  expect(context.omitted).toContain("acquisition segment");
  await page.getByLabel("Segment cohorts by", { exact: true }).selectOption("discount_code");
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).toHaveValue("");
  await expect(page.getByRole("searchbox", { name: "Find a segment", exact: true })).toHaveValue("");
  await expect(page.getByText("Choose a segment to load its cohorts", { exact: true })).toBeVisible();
  await page.getByRole("combobox", { name: "Acquisition segment", exact: true }).selectOption("WELCOME10");
  await page.getByLabel("Segment cohorts by", { exact: true }).selectOption("no_filters");
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).toHaveCount(0);
  await expect(page.getByRole("table", { name: "Purchased a second time", exact: true })).toBeVisible();
});

test("retention: an unavailable segment remains explicit and can be changed", async ({ page }) => {
  await page.goto(
    "/retention?store=sample-store-a&as_of=2026-09&acquisition_dimension=campaign&acquisition_segment=unavailable",
  );
  await expect(page.getByText(/No published cohorts match this acquisition segment/)).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).toHaveValue("unavailable");
  await page.getByRole("combobox", { name: "Acquisition segment", exact: true }).selectOption("Prospecting");
  await expect(page.getByRole("table", { name: "Monthly retention", exact: true })).toBeVisible();
});
test("retention: second purchases have their own cumulative measure and mature ages", async ({ page }) => {
  await page.goto("/retention?store=sample-store-a&as_of=2026-09");
  await page.getByLabel("Matrix measure", { exact: true }).selectOption("second");
  await expect(page).toHaveURL(/measure=second/);
  const table = page.getByRole("table", { name: "Purchased a second time", exact: true });
  await expect(table).toBeVisible();
  await expect(table.locator('td[data-state="immature"]').first()).toHaveText("—");
  await expect(table.locator('td[data-state="value"]').first()).not.toHaveText("100%");
  // The measure's definition sits behind "About this measure" above the matrix.
  await page.locator("summary").filter({ hasText: "About this measure" }).click();
  await expect(page.getByText("Customers who have placed a second order", { exact: false })).toBeVisible();
});
import { expectNoSeriousA11yViolations } from "../../../e2e/helpers";

test("retention: incomplete months, published gaps, and measure/channel selections remain explicit", async ({
  page,
}) => {
  await page.goto("/retention?store=sample-store-a&as_of=2026-09&channel=online_dtc");
  const table = page.getByRole("table", { name: "Monthly retention", exact: true });
  await expect(table).toBeVisible();
  await expect(page.getByRole("form", { name: "Report filters", exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "Apply", exact: true })).toBeHidden();
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
  expect(new URL(page.url()).searchParams.get("store")).toBe("sample-store-a");
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
  await curves.getByRole("button", { name: "View as table", exact: true }).nth(1).click();
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

test("retention: without a month, the store's last complete month applies and is kept for sharing", async ({
  page,
}) => {
  await page.goto("/retention?store=sample-store-a");
  const month = page.getByLabel("Through completed month");
  // The latest selectable month is the last one complete in the store's time zone.
  const latest = await month.getAttribute("max");
  expect(latest).toMatch(/^\d{4}-\d{2}$/);
  await expect(month).toHaveValue(latest ?? "");
  const context = JSON.parse((await page.locator("main [data-agent-page]").getAttribute("data-agent-page")) ?? "{}");
  expect(context.filters).toMatchObject({ store: "sample-store-a", as_of: latest, channel: "online_dtc" });
});

test("retention: a month the report cannot show is reported, not silently replaced", async ({ page }) => {
  // 9999-12 stays in the future for every store; a segment dimension must not start an options query either.
  await page.goto("/retention?store=sample-store-a&as_of=9999-12&acquisition_dimension=campaign");
  const error = page.locator('[data-slot="data-error"]');
  await expect(error).toContainText("Check the month");
  await expect(error).toContainText("already ended");
  await expect(page.getByRole("table", { name: "Monthly retention", exact: true })).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).toHaveCount(0);
  await expect(page.getByLabel("Segment cohorts by", { exact: true })).toHaveValue("campaign");
  // The control suggests the latest complete month; applying it loads the report.
  const month = page.getByLabel("Through completed month", { exact: true });
  await expect(month).toHaveValue(/^\d{4}-\d{2}$/);
  await page.getByRole("button", { name: "Apply month", exact: true }).click();
  await expect(page).toHaveURL(/as_of=\d{4}-\d{2}/);
  await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
  await expect(page.getByRole("combobox", { name: "Acquisition segment", exact: true })).toBeVisible();
  // A streamed select accepts selectOption before its handler is attached; wait until it is interactive.
  const dimension = page.getByLabel("Segment cohorts by", { exact: true });
  await expect(dimension).not.toHaveAttribute("inert");
  await dimension.selectOption("no_filters");
  await expect(page).toHaveURL(/acquisition_dimension=no_filters/);
  await expect(page.getByRole("table", { name: "Monthly retention", exact: true })).toBeVisible();
  await page.goto("/retention?store=sample-store-a&as_of=nonsense");
  await expect(page.locator('[data-slot="data-error"]')).toContainText("Choose a valid month.");
});
