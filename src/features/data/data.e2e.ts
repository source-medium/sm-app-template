import { expect, test } from "@playwright/test";
import { expectNoSeriousA11yViolations } from "../../../e2e/helpers";
test("data definitions search stays in the URL and preserves the existing field composer workflow", async ({
  page,
}) => {
  const prefetches: string[] = [];
  page.on("request", (request) => {
    if (request.headers()["next-router-prefetch"]) prefetches.push(request.url());
  });
  await page.goto("/data?store=sample-store-a&tab=metrics");
  await page.getByLabel("Search metrics", { exact: true }).fill("valid orders");
  await page.getByRole("button", { name: "Search metrics", exact: true }).click();
  await expect(page).toHaveURL(/q=valid/);
  await page.reload();
  await expect(page.getByLabel("Search metrics", { exact: true })).toHaveValue("valid orders");
  await expect(page.getByText(/Definition matches do not establish/)).toBeVisible();
  await page.getByRole("link", { name: "Availability & health", exact: true }).click();
  await expect(page.getByText(/Sample data: health is not assessed/)).toBeVisible();
  await expect(page.getByText("Unknown", { exact: true })).toHaveCount(3);
  await page.getByRole("link", { name: "Fields", exact: true }).click();
  await expect(page.getByLabel("Published source", { exact: true })).toHaveValue("obt_orders");
  await expectNoSeriousA11yViolations(page);
  expect(prefetches, "Unvisited metadata tabs must not start warehouse requests").toEqual([]);
});
