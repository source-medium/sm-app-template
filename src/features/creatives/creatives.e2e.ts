import { expect, test } from "@playwright/test";

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
