import AxeBuilder from "@axe-core/playwright";
import { expect, type Locator, type Page } from "@playwright/test";

/** Page-level overflow misses text clipped by a card or colliding with its next metric cell. */
export async function expectTextContained(locator: Locator) {
  const overflow = await locator.evaluateAll((elements) =>
    elements.flatMap((element) => {
      const box = element.getBoundingClientRect();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const problems: string[] = [];
      while (walker.nextNode()) {
        if (!walker.currentNode.textContent?.trim()) continue;
        const range = document.createRange();
        range.selectNodeContents(walker.currentNode);
        if ([...range.getClientRects()].some((rect) => rect.left < box.left - 1 || rect.right > box.right + 1)) {
          problems.push(walker.currentNode.textContent);
        }
      }
      return problems;
    }),
  );
  expect(overflow, "Text must fit its own card content or metric cell").toEqual([]);
}

/**
 * Console errors and hydration warnings. Only creative images may fail to
 * load: the sample's deliberately expired link and ad-platform links (another
 * origin), which expire and show the creative's text instead. A failed
 * script, style, or route on the app's own origin is a problem.
 */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    const url = message.location().url;
    if (
      message.type() === "error" &&
      /Failed to load resource/.test(text) &&
      (url.endsWith("/sample-creatives/expired-link.svg") ||
        (URL.canParse(url) && new URL(url).origin !== new URL(page.url()).origin))
    )
      return;
    if (message.type() === "error" || /hydrat/i.test(text)) problems.push(text);
  });
  page.on("pageerror", (error) => problems.push(error.message));
  return problems;
}

export async function expectNoSeriousA11yViolations(page: Page): Promise<void> {
  // App Router streams route metadata after a filter navigation. Assert that
  // the title arrived before scanning the completed report, without skipping it.
  await expect(page).toHaveTitle(/\S/);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}

/** Store selection uses applied report state, independently of editable date fields. */
export async function switchStore(page: Page, id: string) {
  await page.getByRole("button", { name: /^Store:/ }).click();
  await page.getByRole("dialog", { name: "Switch store" }).locator(`[data-store-option="${id}"]`).click();
  await expect(page.getByRole("button", { name: /^Store:/ })).toHaveAttribute("data-store-id", id);
}

/** Programmatic selection ignores inert; wait until a person could use the hydrated control. */
export async function choose(page: Page, label: string, value: Parameters<Locator["selectOption"]>[0]) {
  const select = page.getByRole("combobox", { name: label, exact: true });
  await expect(select).not.toHaveAttribute("inert");
  await select.selectOption(value);
}

/** Disclosures are intentionally reset when a new filtered data region mounts. */
export async function openDisclosure(page: Page, summary: string) {
  const details = page
    .locator("details")
    .filter({ has: page.locator("summary").filter({ hasText: new RegExp(`^${summary}$`) }) })
    .first();
  await expect(details.locator(":scope > summary")).toBeVisible();
  if (!(await details.evaluate((node) => (node as HTMLDetailsElement).open)))
    await details.locator(":scope > summary").click();
  await expect(details).toHaveAttribute("open", "");
}
