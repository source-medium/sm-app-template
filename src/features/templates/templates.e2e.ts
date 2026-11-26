import { expect, test } from "@playwright/test";
import { appConfig } from "@/app.config";
import { watchConsole } from "../../../e2e/helpers";
import { PRESETS } from "./presets";

test.skip(!appConfig.nav.some((item) => item.href === "/templates"), "No Templates view");

test("templates: every preset is ready on sample data and opens its view with its settings and the store", async ({
  page,
}) => {
  const errors = watchConsole(page);
  await page.goto("/templates?store=sample-store-b");
  const cards = page.locator("[data-preset]");
  await expect(cards).toHaveCount(
    PRESETS.filter((preset) => appConfig.nav.some((nav) => nav.href === preset.route)).length,
  );
  await expect(page.locator('[data-preset]:not([data-readiness="ready"])')).toHaveCount(0);
  for (const preset of PRESETS) {
    const card = page.locator(`[data-preset="${preset.id}"]`);
    if (!(await card.count())) continue;
    await test.step(preset.id, async () => {
      await page.goto("/templates?store=sample-store-b");
      await card.getByRole("link", { name: preset.question }).click();
      await expect(page).toHaveURL((url) => url.pathname === preset.route);
      const url = new URL(page.url());
      expect(url.searchParams.get("store")).toBe("sample-store-b");
      for (const [key, value] of Object.entries(preset.params)) expect(url.searchParams.get(key), key).toBe(value);
      await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
      // Every streamed region settles without an error state.
      await page.waitForLoadState("networkidle");
      await expect(page.locator('[data-slot="data-error"]')).toHaveCount(0);
      if (preset.hash) {
        expect(url.hash).toBe(`#${preset.hash}`);
        await expect(page.locator(`[id="${preset.hash}"]`)).toBeAttached();
      }
    });
  }
  expect(errors).toEqual([]);
});
