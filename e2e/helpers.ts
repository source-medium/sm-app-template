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
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  expect(
    serious.map((violation) => `${violation.id}: ${violation.nodes.map((node) => node.target.join(" ")).join(", ")}`),
  ).toEqual([]);
}
