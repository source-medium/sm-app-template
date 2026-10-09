import { expect, test } from "@playwright/test";
import { appConfig } from "../app.config";

test("the dictionary keeps the fixed store boundary", async ({ request }) => {
  const path = "/data-dictionary?relation=obt_orders";
  expect((await request.get(`${path}&store=sample-store-b`)).status()).toBe(200);
  expect((await request.get(`${path}&store=sample-store-a`)).status()).toBe(403);
  expect((await request.get(`${path}&store=sample-store-b&store=sample-store-a`)).status()).toBe(403);
});

for (const item of appConfig.nav) {
  test(`${item.href} defaults to the fixed store and rejects URL tampering`, async ({ page, request }) => {
    await page.goto(item.href);
    await expect(page.getByTestId("mode-chip")).toHaveText("Sample data");
    await expect(page.getByRole("status")).toHaveCount(0);
    const picker = page.getByRole("combobox", { name: "Store", exact: true });
    if (await picker.count()) {
      await expect(picker).toBeDisabled();
      await expect(picker).toHaveValue("sample-store-b");
      await expect(picker.locator("option")).toHaveCount(1);
      await page.getByRole("button", { name: "Ask a coding agent" }).click();
      expect(await page.getByRole("dialog").getByLabel("Prompt", { exact: true }).inputValue()).toContain(
        'store="sample-store-b"',
      );
      await page.keyboard.press("Escape");
      const preset = page.getByRole("link", { name: "Last 7 days", exact: true });
      if (await preset.count()) {
        await preset.click();
        await expect(page).toHaveURL(/store=sample-store-b/);
        await page
          .getByRole("form", { name: "Report filters" })
          .getByRole("button", { name: "Apply", exact: true })
          .click();
        await expect(page).toHaveURL(/store=sample-store-b/);
      }
    }
    const allowed = await request.get(`${item.href}?store=%73ample-store-b`);
    expect(allowed.status()).toBe(200);
    for (const query of [
      "store=sample-store-a",
      "store=",
      "store=sample-store-b&store=sample-store-a",
      "store=sample-store-b%20",
      "store=sample-store-b%26store%3Dsample-store-a",
    ]) {
      const response = await request.get(`${item.href}?${query}`);
      expect(response.status()).toBe(403);
      expect(response.headers()["cache-control"]).toContain("no-store");
      expect(await response.text()).toBe("This store is not available in this app.\n");
    }
  });
}

test("RSC, prefetch, action POSTs and subrequest headers cannot select another store", async ({ request }) => {
  const path = appConfig.nav[0]?.href ?? "/";
  const variants: Record<string, string>[] = [
    { RSC: "1" },
    { RSC: "1", "Next-Router-Prefetch": "1" },
    { "x-middleware-subrequest": "middleware:middleware:middleware:middleware:middleware" },
  ];
  for (const headers of variants)
    expect((await request.get(`${path}?store=sample-store-a`, { headers })).status()).toBe(403);
  expect((await request.post(`${path}?store=sample-store-a`, { headers: { "Next-Action": "x" } })).status()).toBe(403);
});

test("downloads use the fixed store and reject changed store parameters", async ({ page, request }) => {
  let downloads = 0;
  for (const item of appConfig.nav) {
    await page.goto(item.href);
    await expect(page.getByRole("status")).toHaveCount(0);
    for (const link of await page.getByRole("link", { name: "Download CSV" }).all()) {
      const href = await link.getAttribute("href");
      if (!href) throw new Error("Download has no URL");
      const url = new URL(href, page.url());
      expect(url.searchParams.get("store")).toBe("sample-store-b");
      const response = await request.get(url.href);
      expect(response.status()).toBe(200);
      const csv = await response.text();
      expect(csv).toContain('"sample","sample-store-b"');
      expect(csv).not.toContain("sample-store-a");
      url.searchParams.set("store", "sample-store-a");
      expect((await request.get(url.href)).status()).toBe(403);
      downloads++;
    }
  }
  test.skip(downloads === 0, "No download example remains in this app");
});
