import { expect, test } from "@playwright/test";
import { expectTextContained } from "../../../e2e/helpers";

test("creatives: large metric values cannot overlap adjacent cells", async ({ page }) => {
  await page.goto("/creatives");
  const metrics = page.getByRole("list", { name: "Ad creatives" }).locator("dd");
  await expect(metrics.first()).toBeVisible();
  await metrics.first().evaluate((node) => {
    node.textContent = "$12,345,678,901,234.56";
  });
  for (const width of [320, 640, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expectTextContained(metrics);
  }
});

test("creatives: an unreachable image shows the card's text, never a broken image", async ({ page }) => {
  await page.goto("/creatives");
  const card = page.getByRole("listitem").filter({ hasText: "Spring colors are here" });
  await card.scrollIntoViewIfNeeded();
  await expect(card.getByText(/image link has expired/)).toBeVisible();
  await expect(card.getByRole("img")).toHaveCount(0);
  const sources = await page
    .getByRole("list", { name: "Ad creatives" })
    .locator("img")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") ?? ""));
  for (const src of sources) expect(src.startsWith("/sample-creatives/")).toBe(true);
});

test("creatives: ad platform filtering survives sorting and unknown selections can be reset", async ({ page }) => {
  await page.goto("/creatives?store=sample-store-a&channel=google_ads");
  await expect(page.getByRole("heading", { name: "Official store – free shipping", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toHaveCount(0);
  await page.getByLabel("Sort by", { exact: true }).selectOption("ctr");
  await expect(page.getByLabel("Ad platform", { exact: true })).toHaveValue("google_ads");
  await page.getByLabel("Ad platform", { exact: true }).selectOption("Meta");
  await expect(page).toHaveURL(/channel=meta_ads/);
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toBeVisible();
  await expect(
    page.getByRole("listitem").filter({ hasText: "Meet the everyday tote" }).getByText("Meta", { exact: true }),
  ).toBeVisible();
  await page.goto("/creatives?store=sample-store-a&channel=unknown");
  await expect(page.getByText("No ad creatives match this store, ad platform, and date range.")).toBeVisible();
  await expect(page.getByLabel("Ad platform", { exact: true })).toHaveValue("unknown");
  await page.getByLabel("Ad platform", { exact: true }).selectOption("");
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toBeVisible();
});

test("creatives: name filters wait for their handlers when scripts load slowly", async ({ page }) => {
  let release: () => void = () => undefined;
  const scripts = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route("**/_next/static/**/*.js", async (route) => {
    await scripts;
    await route.continue();
  });
  const names = JSON.stringify([{ field: "campaign", operator: "contains", values: ["[retargeting]"] }]);
  const filters = page.getByRole("region", { name: "Name filters", exact: true });
  try {
    await page.goto(`/creatives?names=${encodeURIComponent(names)}`, { waitUntil: "commit" });
    for (const name of ["Add name filter", /^Edit Campaign/, /^Remove Campaign/, "Clear name filters"]) {
      await expect(filters.getByRole("button", { name })).toBeDisabled();
    }
  } finally {
    release();
  }
  await filters.getByRole("button", { name: /^Remove Campaign/ }).click();
  await expect(page).toHaveURL((url) => !url.searchParams.has("names"));
});

test("creatives: literal name rules combine, inspect, edit, survive sorting and clear", async ({ page }) => {
  await page.goto("/creatives?store=sample-store-a&from=2026-09-01&to=2026-09-07");
  await page.getByRole("button", { name: "Add name filter" }).click();
  await expect(page.getByRole("combobox", { name: "Name field", exact: true })).toBeFocused();
  await page.getByLabel("Values, one per line").fill("[RETARGETING]\nno such campaign");
  await page.getByRole("button", { name: "Apply name filter" }).click();
  const first = [{ field: "campaign", operator: "contains", values: ["[RETARGETING]", "no such campaign"] }];
  await expect.poll(() => new URL(page.url()).searchParams.get("names")).toBe(JSON.stringify(first));
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toBeVisible();
  await page.getByText("Matching names", { exact: true }).click();
  const matches = page.getByRole("table", { name: "Matching campaign and ad names" });
  await expect(matches.locator("mark").first()).toHaveText("[retargeting]");
  await page.getByRole("button", { name: "Add name filter" }).click();
  await page.getByRole("combobox", { name: "Name field", exact: true }).selectOption("ad");
  await page.getByRole("combobox", { name: "Match", exact: true }).selectOption("excludes");
  await page.getByLabel("Values, one per line").fill("test\nUGC");
  await page.getByRole("button", { name: "Apply name filter" }).click();
  await expect(page.getByText("No ad creatives match these filters. Try editing or clearing a filter.")).toBeVisible();
  await page.getByRole("button", { name: /^Edit Ad name does not contain/ }).click();
  await page.getByLabel("Values, one per line").fill("draft");
  await page.getByRole("button", { name: "Apply name filter" }).click();
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toBeVisible();
  await page.getByLabel("Sort by", { exact: true }).selectOption("roas");
  const names = new URL(page.url()).searchParams.get("names");
  expect(JSON.parse(names ?? "[]")).toEqual([...first, { field: "ad", operator: "excludes", values: ["draft"] }]);
  await page.reload();
  await expect(page.getByRole("button", { name: /^Edit Ad name does not contain/ })).toBeVisible();
  await page.getByRole("button", { name: /^Remove Ad name does not contain/ }).click();
  await expect.poll(() => new URL(page.url()).searchParams.get("names")).toBe(JSON.stringify(first));
  await page.getByRole("button", { name: "Clear name filters" }).click();
  await expect.poll(() => new URL(page.url()).searchParams.has("names")).toBe(false);
  await expect(page.getByRole("heading", { name: "Official store – free shipping", exact: true })).toBeVisible();
});

test("creatives: malformed name filters block the report until cleared", async ({ page }) => {
  await page.goto("/creatives?names=invalid");
  await expect(
    page.getByText("These name filters could not be read. Clear them and add the rules again."),
  ).toBeVisible();
  await expect(page.getByRole("list", { name: "Ad creatives" })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear name filters" }).click();
  await expect(page.getByRole("list", { name: "Ad creatives" })).toBeVisible();
});

test("creatives: Vibe code targets one card's metric without copying its contents", async ({ page }) => {
  await page.goto("/creatives?store=sample-store-a&from=2026-09-01&to=2026-09-07");
  const card = page.getByRole("list", { name: "Ad creatives" }).locator("li").nth(1);
  const title = await card.getByRole("heading").innerText();
  await page.getByRole("button", { name: "Vibe code" }).click();
  const dialog = page.getByRole("dialog", { name: "Vibe code" });
  await dialog.getByLabel("Your request").fill("Make this metric easier to read.");
  await dialog.getByRole("button", { name: "Pick an element" }).click();
  await card
    .locator("dt")
    .filter({ hasText: /^Spend$/ })
    .click();
  await expect(dialog.getByLabel("Prompt")).toHaveValue(/Ad creatives \(Card grid\) · Card 2 · Spend/);
  expect(await dialog.getByLabel("Prompt").inputValue()).not.toContain(title);
  await expect(dialog.getByLabel("Your request")).toHaveValue("Make this metric easier to read.");
});

test("creatives defaults to Performance, preserves explicit views and compares compound selections", async ({
  page,
}) => {
  await page.goto("/creatives?store=sample-store-a&from=2026-09-01&to=2026-09-07");
  await expect(page.getByLabel("View", { exact: true })).toHaveValue("returns");
  await expect(
    page.getByRole("list", { name: "Ad creatives" }).getByText("Platform ROAS", { exact: true }).first(),
  ).toBeVisible();
  await page.getByRole("link", { name: "Compare creative", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Creative comparison (1/4)", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Compare creative", exact: true }).first().click();
  await expect(page.getByRole("heading", { name: "Creative comparison (2/4)", exact: true })).toBeVisible();
  await expect(page.getByRole("list", { name: "Selected creatives" })).toBeVisible();
  const ids = new URL(page.url()).searchParams.get("selection");
  expect(JSON.parse(ids ?? "[]")).toHaveLength(2);
  await page.getByRole("button", { name: "Vibe code", exact: true }).click();
  const prompt = await page.getByRole("dialog", { name: "Vibe code" }).getByLabel("Prompt").inputValue();
  expect(prompt).not.toContain(ids);
  await page.getByRole("dialog", { name: "Vibe code" }).getByRole("button", { name: "Close", exact: true }).click();
  await page.reload();
  await expect(page.getByRole("list", { name: "Selected creatives" })).toBeVisible();
  await page.goto("/creatives?view=delivery");
  await expect(page.getByLabel("View", { exact: true })).toHaveValue("delivery");
  await page.goto("/creatives?view=returns&min_spend=999999999&min_conversions=1.5");
  await expect(page.getByLabel("View", { exact: true })).toHaveValue("returns");
  await expect(page.getByLabel("Minimum conversions", { exact: true })).toHaveValue("1.5");
  await expect(page.getByRole("list", { name: "Ad creatives" })).toHaveCount(0);
});
