import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

export const VIEWS = ["/overview", "/paid-marketing", "/creatives", "/orders"] as const;

/** Console errors and hydration warnings, minus the sample's deliberately expired creative image. */
export function watchConsole(page: Page): string[] {
  const problems: string[] = [];
  page.on("console", (message) => {
    const text = message.text();
    if (message.type() === "error" && /Failed to load resource/.test(text)) return;
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
