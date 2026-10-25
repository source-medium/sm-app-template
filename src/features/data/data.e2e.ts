import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "../../../e2e/helpers";

test("explore your data: find a metric, understand it, and open its report in three interactions", async ({ page }) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (["fetch", "xhr", "document"].includes(request.resourceType())) requests.push(request.url());
  });
  await page.goto("/data?store=sample-store-a");
  const list = page.getByRole("list", { name: "Published metrics" });
  await expect(list.getByRole("listitem")).toHaveCount(15);
  requests.length = 0;
  // 1. Search filters the loaded catalog locally and records the search in the URL.
  await page.getByLabel("Search metrics", { exact: true }).pressSequentially("net revenue");
  // Two revenue metrics plus MER, whose description names net revenue.
  await expect(list.getByRole("listitem")).toHaveCount(3);
  await expect(page).toHaveURL(/q=net\+revenue/);
  // 2. Open the metric: plain meaning first, technical details on request.
  await list.getByRole("button", { name: /Net Revenue \(Executive Summary\)/ }).click();
  const drawer = page.getByRole("dialog", { name: "Net Revenue (Executive Summary)" });
  await expect(drawer.getByText(/Net revenue from executive summary data/)).toBeVisible();
  await expect(drawer.getByText("order_net_revenue_summary", { exact: true })).toBeHidden();
  await drawer.getByText("Technical details", { exact: true }).click();
  await expect(drawer.getByText("order_net_revenue_summary", { exact: true })).toBeVisible();
  expect(requests, "search and the drawer must not query the warehouse").toEqual([]);
  // 3. View in report carries the store.
  const view = drawer.getByRole("link", { name: "View in Overview" });
  await expect(view).toHaveAttribute("href", "/overview?store=sample-store-a");
  await view.click();
  await expect(page).toHaveURL(/\/overview\?store=sample-store-a/);
});

for (const { name, query, category, count } of [
  { name: "search", query: "orders", category: "", count: 2 },
  { name: "category", query: "revenue", category: "obt_orders", count: 1 },
]) {
  test(`explore your data: Back restores the URL's ${name} and matching results`, async ({ page }) => {
    await page.goto("/data?store=sample-store-a&q=revenue");
    const search = page.getByLabel("Search metrics", { exact: true });
    const chips = page.getByRole("group", { name: "Metric categories" });
    const items = page.getByRole("list", { name: "Published metrics" }).getByRole("listitem");
    await expect(search).toHaveValue("revenue");
    const requests: string[] = [];
    page.on("request", (request) => {
      if (["fetch", "xhr", "document"].includes(request.resourceType())) requests.push(request.url());
    });
    if (category) await chips.getByRole("button", { name: category, exact: true }).click();
    else await search.fill(query);
    await expect(items).toHaveCount(count);
    expect(requests).toEqual([]);
    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Overview", exact: true })).toBeVisible();
    await page.goBack();
    await expect(page).toHaveURL(
      (url) => url.searchParams.get("q") === query && (url.searchParams.get("category") ?? "") === category,
    );
    await expect(search).toHaveValue(query);
    await expect(chips.getByRole("button", { name: category || "All categories", exact: true })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await expect(items).toHaveCount(count);
  });
}

test("explore your data: categories, aliases, Vibe code, fields and health stay honest", async ({ page }) => {
  await page.goto("/data?store=sample-store-a");
  const list = page.getByRole("list", { name: "Published metrics" });
  const requests: string[] = [];
  page.on("request", (request) => {
    if (["fetch", "xhr", "document"].includes(request.resourceType())) requests.push(request.url());
  });
  // The bundled catalog predates published categories, so its models stand in as groups.
  const chips = page.getByRole("group", { name: "Metric categories" });
  await chips.getByRole("button", { name: /rpt_ad_performance_daily/ }).click();
  await expect(list.getByRole("listitem")).toHaveCount(8);
  await expect(page).toHaveURL(/category=/);
  await page.getByLabel("Search metrics", { exact: true }).fill("ctr");
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await list.getByRole("button", { name: /Click-Through Rate/ }).click();
  const drawer = page.getByRole("dialog", { name: "Click-Through Rate (CTR)" });
  await expect(drawer.getByText("View in Creatives")).toBeVisible();
  await drawer.getByRole("button", { name: "Use in Vibe code" }).click();
  const composer = page.getByRole("dialog", { name: "Vibe code" });
  await expect(composer.getByText("Selected metric:")).toBeVisible();
  await expect(composer.getByText("click_through_rate", { exact: true })).toBeVisible();
  expect(await composer.getByLabel("Prompt", { exact: true }).inputValue()).toContain("Selected published metric");
  await page.keyboard.press("Escape");
  expect(requests).toEqual([]);
  await page.getByLabel("Search metrics", { exact: true }).fill("no such metric");
  await expect(page.getByText("No metrics match")).toBeVisible();
  await page.getByRole("button", { name: "Show all metrics" }).click();
  await expect(list.getByRole("listitem")).toHaveCount(15);
  await page.getByRole("link", { name: "Data health", exact: true }).click();
  await expect(page.getByText("Sample data: not assessed.", { exact: false })).toBeVisible();
  await expect(page.getByText("Unknown", { exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Fields", exact: true }).click();
  await expect(page.getByLabel("Published source", { exact: true })).toHaveValue("obt_orders");
  await expect(page.getByLabel("Search fields")).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  // An unknown tab, such as the old metrics tab, opens Explore.
  await page.goto("/data?store=sample-store-a&tab=metrics&q=sessions");
  await expect(list.getByRole("listitem")).toHaveCount(1);
});
