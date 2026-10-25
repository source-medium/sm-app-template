import { appConfig } from "@/app.config";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations, choose, chooseMeasure } from "../../../e2e/helpers";
const query = "store=sample-store-a&from=2026-09-01&to=2026-09-07&compare=off";
test("geography preserves shipping population and created date basis through Orders and back", async ({ page }) => {
  test.skip(!appConfig.nav.some((item) => item.href === "/orders"), "Orders example removed");
  await page.goto(`/geography?${query}&country=US&region=CA&date_basis=created`);
  await expect(page.getByRole("heading", { name: "Sales by geography", exact: true })).toBeVisible();
  await expect(page.getByText(/Created \(store time\). Valid orders only/)).toBeVisible();
  await page.getByRole("link", { name: "Explore these orders", exact: true }).click();
  await expect(page).toHaveURL(
    (url) =>
      url.pathname === "/orders" &&
      url.searchParams.get("country") === "US" &&
      url.searchParams.get("region") === "CA" &&
      url.searchParams.get("population") === "valid" &&
      url.searchParams.get("date_basis") === "created",
  );
  await expect(page.getByLabel("Date basis", { exact: true })).toHaveValue("created");
  await expect(page.getByLabel("Order population", { exact: true })).toHaveValue("valid");
  await page.reload();
  await expect(page.getByText(/Applied date basis: Created/)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/geography/);
});
test("geography offers keyboard selection, mobile optional maps, themes and empty scope", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 900 });
  await page.goto(`/geography?${query}`);
  await expect(page.getByRole("group", { name: /Shipping destination map/ })).toHaveCount(0);
  const table = page.getByRole("table").first();
  await expect(table).toBeVisible();
  await expectNoSeriousA11yViolations(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(page.getByRole("group", { name: /Shipping destination map/ })).toBeVisible();
  await page.getByRole("button", { name: "Hide map", exact: true }).click();
  const selection = table.getByRole("link").first();
  await selection.focus();
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(/country=/);
  await page.goto(`/geography?${query}&country=ZZ`);
  await expect(page.getByText(/No valid orders match/)).toBeVisible();
  await page.goto(`/geography?${query}&country=CA`);
  await expect(page.getByText(/Region maps are currently available for U.S. states/)).toBeVisible();
  await choose(page, "Date basis", "processed");
  await expect(page).toHaveURL(/date_basis=processed/);
});

for (const width of [320, 1280])
  for (const theme of ["Light", "Dark"]) {
    test(`geography ${width}px ${theme} reflows accessibly with a table alternative`, async ({ page }, info) => {
      await page.setViewportSize({ width, height: 900 });
      await page.goto(`/geography?${query}&country=US`);
      await page.getByRole("button", { name: /^Appearance:/ }).click();
      await page.getByRole("menuitemradio", { name: theme, exact: true }).click();
      await expectNoSeriousA11yViolations(page);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: info.outputPath(`geography-${width}-${theme}.png`), fullPage: true });
    });
  }

test("geography: the daily trend's measure survives filter links and form submits", async ({ page }) => {
  await page.goto("/geography?store=sample-store-a&from=2026-09-01&to=2026-09-07&country=US&region=CA&metric=revenue");
  await chooseMeasure(page, "Net revenue", "Valid orders");
  await expect(page.getByRole("img", { name: /^Valid orders by day in .+ chart$/ })).toBeVisible();
  await expect(page).toHaveURL(/metric=orders/);
  // This link was built while the page named Net revenue; it resumes the live measure instead.
  await page.getByRole("link", { name: "All regions in US", exact: true }).click();
  await expect(page).toHaveURL((url) => !url.searchParams.has("region"));
  await expect(page.getByRole("img", { name: "Valid orders by day in US chart", exact: true })).toBeVisible();
  await choose(page, "Date basis", "created");
  await expect(page).toHaveURL(/date_basis=created/);
  await expect(page.getByRole("img", { name: "Valid orders by day in US chart", exact: true })).toBeVisible();
  await expect(page).toHaveURL(/metric=orders/);
});

test("map geometry stays off other reports and loads only when a phone requests a map", async ({ page }) => {
  const markers = ["countries.json", "us-states.json"].map((file) => {
    const geometry = JSON.parse(readFileSync(path.join(process.cwd(), "src/features/geography/assets", file), "utf8"));
    return Object.values(geometry.paths)[0] as string;
  });
  const scripts = readdirSync(".next/static/chunks")
    .filter((file) => file.endsWith(".js"))
    .map((file) => ({ file, code: readFileSync(path.join(".next/static/chunks", file), "utf8") }));
  const chunks = scripts.filter(({ code }) => markers.some((marker) => code.includes(marker))).map(({ file }) => file);
  const mapChunks = scripts
    .filter(
      ({ file, code }) =>
        chunks.includes(file) || code.includes("Shipping destination map") || code.includes("Loading local map"),
    )
    .map(({ file }) => file);
  expect(chunks).toHaveLength(2);
  const loaded: string[] = [];
  const mapRequests: string[] = [];
  page.on("request", (request) => {
    if (chunks.some((file) => request.url().includes(file))) loaded.push(request.url());
    if (mapChunks.some((file) => request.url().includes(file))) mapRequests.push(request.url());
  });
  await page.setViewportSize({ width: 320, height: 900 });
  const other = appConfig.nav.find((item) => item.href !== "/geography");
  if (other) {
    await page.goto(other.href);
    await expect(page.getByRole("button", { name: /^Appearance:/ })).toBeEnabled();
    expect(loaded).toEqual([]);
    expect(mapRequests).toEqual([]);
  }
  await page.goto(`/geography?${query}`);
  await expect(page.getByRole("table").first()).toBeVisible();
  expect(loaded).toEqual([]);
  await page.getByRole("button", { name: "Show map", exact: true }).click();
  await expect(page.getByRole("group", { name: /Shipping destination map/ })).toBeVisible();
  expect(loaded).toHaveLength(1);
});
