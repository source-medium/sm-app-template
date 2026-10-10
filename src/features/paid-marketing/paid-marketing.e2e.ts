import { expect, test } from "@playwright/test";

test("paid marketing: ranked spend shares, dimension changes, and comparisons honor URL filters", async ({ page }) => {
  await page.goto("/paid-marketing?store=sample-store-b&from=2026-09-01&to=2026-09-07&compare=year");
  const region = page.getByRole("region", { name: "Spend breakdown", exact: true });
  const channelTable = region.getByRole("table", { name: "Spend by channel details", exact: true });
  await expect(channelTable.getByRole("columnheader", { name: "Share of total" })).toBeVisible();
  await expect(channelTable.getByRole("columnheader", { name: "Change vs comparison" })).toBeVisible();
  await channelTable.getByRole("link", { name: "Meta", exact: true }).click();
  await expect(page).toHaveURL(/channel=Meta/);
  await page.getByLabel("Break down spend by", { exact: true }).selectOption("campaign");
  await expect(page).toHaveURL(/breakdown=campaign/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("channel")).toBe("Meta");
  expect(params.get("compare")).toBe("year");
  const campaignTable = region.getByRole("table", { name: "Spend by campaign details", exact: true });
  await expect(campaignTable.locator("tbody tr")).toHaveCount(3);
  await page.getByLabel("Compare spend breakdown with").selectOption("off");
  await expect(page).toHaveURL(/compare=off/);
  await expect(campaignTable.getByRole("columnheader", { name: "Change vs comparison" })).toHaveCount(0);
  expect(new URL(page.url()).searchParams.get("breakdown")).toBe("campaign");
});

test("paid marketing: downloads raw campaigns for the applied filters", async ({ page }) => {
  await page.goto("/paid-marketing?store=sample-store-b&from=2026-09-01&to=2026-09-07&channel=Meta");
  const link = page.getByRole("link", { name: "Download CSV" });
  await expect(link).toBeVisible();
  // An unsubmitted edit must not change the exported report.
  await page.getByLabel("From", { exact: true }).fill("2020-01-01");
  const pending = page.waitForEvent("download");
  await link.click();
  const download = await pending;
  expect(download.suggestedFilename()).toBe("sample-campaigns-2026-09-01-2026-09-07.csv");
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const lines = Buffer.concat(chunks).toString("utf8").trimEnd().split("\r\n");
  expect(lines).toHaveLength(4); // Three Meta campaigns, plus the header.
  expect(lines[0]).toContain('"spend","impressions","clicks"');
  for (const line of lines.slice(1)) {
    expect(line).toContain('"sample","sample-store-b","2026-09-01","2026-09-07","","false"');
    expect(line).toMatch(/,"Meta","\d+(?:\.\d+)?","\d+","\d+",/);
  }
});

test("paid marketing: calendar presets preserve the store and channel", async ({ page }) => {
  await page.goto("/paid-marketing?store=sample-store-b&channel=Google&metric=clicks&compare=year");
  await page.getByText("More dates", { exact: true }).click();
  const preset = page.getByRole("link", { name: "Last month", exact: true });
  const href = await preset.getAttribute("href");
  if (!href) throw new Error("Last month preset has no link");
  await preset.click();
  await expect(page).toHaveURL(href);
  const params = new URL(page.url()).searchParams;
  expect(params.get("store")).toBe("sample-store-b");
  expect(params.get("channel")).toBe("Google");
  expect(params.get("metric")).toBe("clicks");
  expect(params.get("compare")).toBe("year");
  expect(params.get("from")).toMatch(/-01$/);
  await page.getByText("More dates", { exact: true }).click();
  await expect(preset).toHaveAttribute("aria-current", "true");
  await expect(page.getByRole("link", { name: "Download CSV" })).toHaveAttribute(
    "href",
    new RegExp(`from=${params.get("from")}&to=${params.get("to")}`),
  );
});

test("paid marketing: each picker replaces its own value and preserves the other filters", async ({ page }) => {
  await page.goto("/paid-marketing?store=sample-store-b&from=2026-09-01&to=2026-09-07&metric=spend&channel=Google");
  await page.getByLabel("Measure", { exact: true }).selectOption("clicks");
  await expect(page).toHaveURL(/metric=clicks/);
  // Let the clicks view render before the next choice, so its render cannot replace the channel picker mid-change.
  await expect(page.getByText("Clicks by channel over time", { exact: true })).toBeVisible();
  await page.getByLabel("Channel", { exact: true }).selectOption("Meta");
  await expect(page).toHaveURL(/channel=Meta/);
  const params = new URL(page.url()).searchParams;
  expect(params.getAll("metric")).toEqual(["clicks"]);
  expect(params.getAll("channel")).toEqual(["Meta"]);
  expect(params.get("store")).toBe("sample-store-b");
  expect(params.get("from")).toBe("2026-09-01");
  expect(params.get("to")).toBe("2026-09-07");
  await expect(page.getByRole("heading", { name: "Campaigns in Meta" })).toBeVisible();
});

test("paid marketing: a channel filter narrows the campaigns", async ({ page }) => {
  await page.goto("/paid-marketing");
  await page.getByLabel("Channel", { exact: true }).selectOption("Google");
  await expect(page).toHaveURL(/channel=Google/);
  await expect(page.getByRole("heading", { name: "Campaigns in Google" })).toBeVisible();
  const channels = await page
    .getByRole("table", { name: "Campaigns by spend" })
    .locator("tbody tr td:nth-child(2)")
    .allTextContents();
  expect(new Set(channels)).toEqual(new Set(["Google"]));
});

test("paid marketing: an unmatched channel has a clear empty result and recovery", async ({ page }) => {
  await page.goto("/paid-marketing?store=sample-store-a&channel=Unknown");
  await expect(page.getByLabel("Channel", { exact: true })).toHaveValue("Unknown");
  await expect(page.getByText("No ad delivery matches this channel and date range.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Spend by channel over time chart", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Show all channels", exact: true }).click();
  await expect(page.getByLabel("Channel", { exact: true })).toHaveValue("");
  await expect(page.getByRole("table", { name: "Campaigns by spend", exact: true })).toBeVisible();
});
