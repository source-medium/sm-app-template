/**
 * Maintainer timing (`pnpm test:timing`): how fast each report becomes usable
 * on the sample fixture, cold and repeated, and how much the layout shifts.
 * Numbers print as one JSON line per page for docs/maintainers; they are
 * local evidence from the sample server, not production percentiles, and say
 * nothing about warehouse or cache latency.
 */
import { expect, test, type Page } from "@playwright/test";

const SCOPE = "store=sample-store-a&from=2026-09-01&to=2026-09-28";
const PAGES: { path: string; usable: string }[] = [
  { path: `/overview?${SCOPE}`, usable: '[data-slot="kpi-value"]' },
  { path: `/paid-marketing?${SCOPE}`, usable: "main [role='img'], main table" },
  { path: `/products?${SCOPE}`, usable: '[data-slot="kpi-value"]' },
  { path: `/geography?${SCOPE}`, usable: '[data-slot="kpi-value"]' },
  { path: `/data?${SCOPE}`, usable: "main h2, main [role='tablist'], main nav" },
];

async function installLayoutShiftObserver(page: Page) {
  await page.addInitScript(() => {
    (window as unknown as { __cls: number }).__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as (PerformanceEntry & { hadRecentInput: boolean; value: number })[]) {
        if (!entry.hadRecentInput) (window as unknown as { __cls: number }).__cls += entry.value;
      }
    }).observe({ type: "layout-shift", buffered: true });
  });
}

async function measure(page: Page, path: string, usable: string) {
  const requests = { document: 0, data: 0 };
  const listener = (request: { resourceType(): string }) => {
    const type = request.resourceType();
    if (type === "document") requests.document += 1;
    if (type === "fetch" || type === "xhr") requests.data += 1;
  };
  page.on("request", listener);
  const started = Date.now();
  await page.goto(path);
  const shell = Date.now() - started;
  await expect(page.locator(usable).first()).toBeVisible({ timeout: 30_000 });
  const usableAt = Date.now() - started;
  await page.waitForLoadState("networkidle");
  const cls = await page.evaluate(() => (window as unknown as { __cls: number }).__cls);
  page.off("request", listener);
  return { shellMs: shell, usableMs: usableAt, cls: Number(cls.toFixed(3)), ...requests };
}

for (const { path, usable } of PAGES) {
  test(`timing ${path.split("?")[0]}`, async ({ page }) => {
    await installLayoutShiftObserver(page);
    const cold = await measure(page, path, usable);
    const warm = await measure(page, path, usable);
    // A same-store date change: the shell stays, the regions reload.
    const changed = await measure(page, path.replace("to=2026-09-28", "to=2026-09-21"), usable);
    console.log(JSON.stringify({ page: path.split("?")[0], cold, warm, changed }));
    expect(cold.cls).toBeLessThanOrEqual(0.1);
    expect(warm.cls).toBeLessThanOrEqual(0.1);
    expect(changed.cls).toBeLessThanOrEqual(0.1);
  });
}
