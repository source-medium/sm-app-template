import { choose } from "../../../e2e/helpers";
import { expect, test } from "@playwright/test";
import { appConfig } from "@/app.config";
import { MAX_NAME_FILTER_QUERY_LENGTH } from "@/lib/ad-name-filters";
test("paid marketing: return intervals, classifications, and campaign creative drillthrough preserve scope", async ({
  page,
}) => {
  await page.goto(
    "/paid-marketing?store=sample-store-a&from=2026-09-02&to=2026-09-08&channel=Meta&metric=roas&grain=week&breakdown=tactic",
  );
  await expect(page.getByRole("img", { name: "Platform ROAS by channel over time chart", exact: true })).toBeVisible();
  await expect(page.getByRole("table", { name: "Spend by campaign tactic details", exact: true })).toBeVisible();
  await choose(page, "Trend interval", "month");
  await expect(page).toHaveURL(/grain=month/);
  await choose(page, "Measure", "cpo");
  await expect(page).toHaveURL(/metric=cpo/);
  const campaigns = page.getByRole("table", { name: "Campaigns by spend", exact: true });
  if (!appConfig.nav.some((item) => item.href === "/creatives")) {
    await expect(campaigns.getByRole("link")).toHaveCount(0);
    return;
  }
  await campaigns.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/creatives\?/);
  const params = new URL(page.url()).searchParams;
  expect(Object.fromEntries(["store", "from", "to", "channel", "view"].map((key) => [key, params.get(key)]))).toEqual({
    store: "sample-store-a",
    from: "2026-09-02",
    to: "2026-09-08",
    channel: "Meta",
    view: "returns",
  });
  expect(params.get("campaign")).toMatch(/^cmp-/);
  await expect(
    page.getByRole("list", { name: "Ad creatives", exact: true }).getByText("Platform ROAS", { exact: true }).first(),
  ).toBeVisible();
  await choose(page, "View", "table");
  const returns = page.getByRole("table", { name: "Creative performance", exact: true });
  await expect(returns).toBeVisible();
  await returns.getByRole("button", { name: "Platform ROAS", exact: true }).click();
  await expect(returns.getByRole("columnheader", { name: "Platform ROAS", exact: true })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  await page.getByRole("link", { name: "Show all campaigns", exact: true }).click();
  await expect(page).not.toHaveURL(/campaign=/);
  await expect(page.getByLabel("Ad channel", { exact: true })).toHaveValue("Meta");
});

test("paid marketing: ranked spend shares, dimension changes, and comparisons honor URL filters", async ({ page }) => {
  await page.goto("/paid-marketing?store=sample-store-b&from=2026-09-01&to=2026-09-07&compare=year");
  const region = page.getByRole("region", { name: "Spend breakdown", exact: true });
  const channelTable = region.getByRole("table", { name: "Spend by channel details", exact: true });
  await expect(channelTable.getByRole("columnheader", { name: "Share of total" })).toBeVisible();
  await expect(channelTable.getByRole("columnheader", { name: "Change vs same period last year" })).toBeVisible();
  await channelTable.getByRole("link", { name: "Meta", exact: true }).click();
  await expect(page).toHaveURL(/channel=Meta/);
  await choose(page, "Break down spend by", "campaign");
  await expect(page).toHaveURL(/breakdown=campaign/);
  const params = new URL(page.url()).searchParams;
  expect(params.get("channel")).toBe("Meta");
  expect(params.get("compare")).toBe("year");
  const campaignTable = region.getByRole("table", { name: "Spend by campaign details", exact: true });
  await expect(campaignTable.locator("tbody tr")).toHaveCount(3);
  await choose(page, "Compare spend breakdown with", "off");
  await expect(page).toHaveURL(/compare=off/);
  await expect(campaignTable.getByRole("columnheader", { name: /^Change vs/ })).toHaveCount(0);
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
    expect(line).toContain('"sample","sample-store-b","2026-09-01","2026-09-07","USD","false"');
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
  await choose(page, "Measure", "clicks");
  await expect(page).toHaveURL(/metric=clicks/);
  // Let the clicks view render before the next choice, so its render cannot replace the channel picker mid-change.
  await expect(page.getByText("Clicks by channel over time", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Ad platform", { exact: true })).not.toHaveAttribute("inert");
  await choose(page, "Ad platform", "Meta");
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
  await choose(page, "Ad platform", "Google");
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
  await expect(page.getByLabel("Ad platform", { exact: true })).toHaveValue("Unknown");
  await expect(page.getByText("No ad delivery matches this channel and date range.")).toBeVisible();
  await expect(page.getByRole("img", { name: "Spend by channel over time chart", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Show all channels", exact: true }).click();
  await expect(page.getByLabel("Ad platform", { exact: true })).toHaveValue("");
  await expect(page.getByRole("table", { name: "Campaigns by spend", exact: true })).toBeVisible();
});

test("paid marketing: name filters that match nothing offer to be cleared", async ({ page }) => {
  const names = JSON.stringify([{ field: "campaign", operator: "contains", values: ["no-such-campaign"] }]);
  await page.goto(
    `/paid-marketing?store=sample-store-a&from=2026-09-01&to=2026-09-07&names=${encodeURIComponent(names)}`,
  );
  await expect(page.getByText("No ad delivery matches these filters.", { exact: false })).toBeVisible();
  await expect(page.getByRole("link", { name: "Show all channels", exact: true })).toHaveCount(0);
  await page.getByRole("link", { name: "Clear name filters", exact: true }).click();
  await expect(page).not.toHaveURL(/names=/);
  await expect(page.getByRole("table", { name: "Campaigns by spend", exact: true })).toBeVisible();
});

test("paid marketing: name scope carries through comparisons, CSV, and creative drillthrough", async ({
  page,
  request,
}) => {
  const names = JSON.stringify([{ field: "campaign", operator: "contains", values: ["[retargeting]"] }]);
  await page.goto(
    `/paid-marketing?store=sample-store-a&from=2026-09-01&to=2026-09-07&names=${encodeURIComponent(names)}`,
  );
  const campaigns = page.getByRole("table", { name: "Campaigns by spend" });
  await expect(campaigns.locator("tbody tr")).toHaveCount(1);
  await expect(campaigns).toContainText("[retargeting] Site Visitors");
  await choose(page, "Compare spend breakdown with", "year");
  await expect(page).toHaveURL(/compare=year/);
  await choose(page, "Break down spend by", "campaign");
  await expect(page.getByRole("table", { name: "Spend by campaign details" }).locator("tbody tr")).toHaveCount(1);
  const href = await page.getByRole("link", { name: "Download CSV" }).getAttribute("href");
  if (!href) throw new Error("Missing CSV link");
  expect(new URL(href, page.url()).searchParams.get("names")).toBe(names);
  const response = await request.get(href);
  expect(response.status()).toBe(200);
  const csv = await response.text();
  expect(csv.trimEnd().split("\r\n")).toHaveLength(2);
  expect(csv).toContain('"name_filters"');
  expect(csv).toContain("[retargeting] Site Visitors");
  if (!appConfig.nav.some((item) => item.href === "/creatives")) {
    await expect(campaigns.getByRole("link")).toHaveCount(0);
    return;
  }
  await campaigns.getByRole("link").first().click();
  await expect(page).toHaveURL(/\/creatives\?/);
  expect(new URL(page.url()).searchParams.get("names")).toBe(names);
  expect(new URL(page.url()).searchParams.get("campaign")).toBe("cmp-1002");
  await expect(page.getByRole("heading", { name: "Meet the everyday tote", exact: true })).toBeVisible();
});

test("paid marketing: a near-limit Unicode name filter survives client navigation and reload", async ({ page }) => {
  const names = JSON.stringify([
    { field: "ad", operator: "excludes", values: ["語".repeat(200), "語".repeat(200), "語".repeat(20)] },
  ]);
  const query = new URLSearchParams({ names }).toString();
  expect(query.length).toBeGreaterThan(3800);
  expect(query.length).toBeLessThanOrEqual(MAX_NAME_FILTER_QUERY_LENGTH);
  await page.goto(`/paid-marketing?store=sample-store-a&from=2026-09-01&to=2026-09-07&${query}`);
  await expect(page.getByRole("table", { name: "Campaigns by spend" })).toBeVisible();
  await choose(page, "Measure", "roas");
  await expect(page).toHaveURL(/metric=roas/);
  expect(new URL(page.url()).searchParams.get("names")).toBe(names);
  await expect(page.getByRole("table", { name: "Campaigns by spend" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Measure", { exact: true })).toHaveValue("roas");
  await expect(page.getByRole("table", { name: "Campaigns by spend" })).toBeVisible();
});
