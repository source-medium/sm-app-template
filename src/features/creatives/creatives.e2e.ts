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
    .locator("main img")
    .evaluateAll((nodes) => nodes.map((node) => node.getAttribute("src") ?? ""));
  for (const src of sources) expect(src.startsWith("/sample-creatives/")).toBe(true);
});

test("creatives: ad-channel filtering survives sorting and unknown selections can be reset", async ({ page }) => {
  await page.goto("/creatives?store=sample-store-a&channel=Google");
  await expect(page.getByRole("heading", { name: "Official store – free shipping", exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toHaveCount(0);
  await page.getByLabel("Sort by", { exact: true }).selectOption("ctr");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByLabel("Ad channel", { exact: true })).toHaveValue("Google");
  await page.getByLabel("Ad channel", { exact: true }).selectOption("Meta");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toBeVisible();
  await page.goto("/creatives?store=sample-store-a&channel=unknown");
  await expect(page.getByText("No ad creatives match this store, ad channel, and date range.")).toBeVisible();
  await expect(page.getByLabel("Ad channel", { exact: true })).toHaveValue("unknown");
  await page.getByLabel("Ad channel", { exact: true }).selectOption("");
  await page.getByRole("form", { name: "Report filters" }).getByRole("button", { name: "Apply", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toBeVisible();
});
