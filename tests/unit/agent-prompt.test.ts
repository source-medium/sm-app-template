import { describe, expect, it } from "vitest";
import { AGENT_INTENTS, composeAgentPrompt } from "@/lib/agent-prompt";

const context = {
  pathname: "/overview",
  params: { store: "sample-store-a", from: "2026-09-01", to: "2026-09-07" },
  headings: ["Overview", " Net revenue ", "Orders", "Net revenue", "Revenue by day"],
  mode: "sample" as const,
  build: "18f8d28ed290",
};

describe("composeAgentPrompt", () => {
  it("briefs the agent with the page, its code, the applied filters, the sections, the mode, and the build", () => {
    const prompt = composeAgentPrompt("fix", "The revenue chart dips to zero on Sundays.", context);
    expect(prompt).toBe(
      [
        "Something looks wrong on this page.",
        "",
        "The revenue chart dips to zero on Sundays.",
        "",
        "Context from the running app",
        "- Page: Overview (/overview)",
        "- Code: src/features/overview/ holds this view's queries, row schema, SQL, sample data, and page.",
        "- Applied filters: store=sample-store-a, from=2026-09-01, to=2026-09-07",
        "- Sections on the page: Net revenue; Orders; Revenue by day",
        "- Data mode: sample data (synthetic; nothing from a warehouse)",
        "- App build: 18f8d28ed290",
        "",
        "How to work",
        "- Read AGENTS.md first and follow its five rules.",
        "- Reproduce it with the filters above before changing anything, then fix the cause rather than the symptom and add a test that would have caught it.",
        "- Run pnpm check when done, and pnpm test:e2e after UI changes.",
        "- Tell me separately what you verified on sample data and what still needs live data.",
      ].join("\n"),
    );
  });

  it("keeps a page with nothing in the URL, no headings, or a nested route honest", () => {
    const prompt = composeAgentPrompt("change", "   ", {
      ...context,
      pathname: "/orders/123",
      params: {},
      headings: [],
    });
    expect(prompt).toContain("(Describe what you need here.)");
    expect(prompt).toContain("- Page: /orders/123 (/orders/123)");
    expect(prompt).not.toContain("- Code:");
    expect(prompt).toContain("- Applied filters: none in the URL; the page shows its defaults");
    expect(prompt).not.toContain("- Sections on the page");
  });

  it("bounds long filter values and the section list", () => {
    const prompt = composeAgentPrompt("ask", "", {
      ...context,
      params: { q: "x".repeat(500) },
      headings: ["Title", ...Array.from({ length: 30 }, (_, i) => `Section ${i}`)],
    });
    expect(prompt).toContain(`q=${"x".repeat(100)}\n`);
    expect(prompt).toContain("Section 11");
    expect(prompt).not.toContain("Section 12");
  });

  it("asks read-only intents not to change files and skips the check steps", () => {
    for (const intent of AGENT_INTENTS) {
      const prompt = composeAgentPrompt(intent.id, "Why?", { ...context, mode: "live" });
      expect(prompt).toContain("- Data mode: live warehouse data");
      expect(prompt).toContain("Read AGENTS.md first");
      expect(prompt.includes("Run pnpm check")).toBe(intent.changesCode);
    }
    expect(composeAgentPrompt("ask", "Why?", context)).toContain("Do not change any files.");
    expect(composeAgentPrompt("check", "Why?", context)).toContain("report the number as unverified");
  });
});
