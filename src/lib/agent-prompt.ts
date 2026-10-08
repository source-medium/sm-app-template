/**
 * Composes a coding-agent prompt from what the running app already knows:
 * the page, its applied URL filters, the sections on screen, the data mode,
 * and the build. The person adds one sentence; the agent gets a brief it can
 * act on. Pure and shared by the top-bar composer and its tests. Nothing here
 * reads configuration, so a prompt can never carry a secret.
 */

export const AGENT_INTENTS = [
  {
    id: "fix",
    label: "Something looks wrong",
    lead: "Something looks wrong on this page.",
    placeholder: "What you saw, and what you expected instead.",
    guidance: [
      "Reproduce it with the filters above before changing anything, then fix the cause rather than the symptom and add a test that would have caught it.",
    ],
    changesCode: true,
  },
  {
    id: "change",
    label: "Change this page",
    lead: "Change this page.",
    placeholder: "What should be different, and why.",
    guidance: [
      "Keep the change inside this view's folder where possible, and reuse the shell, patterns, and tokens instead of adding new styling.",
    ],
    changesCode: true,
  },
  {
    id: "add",
    label: "Add something new",
    lead: "Add something new to this app.",
    placeholder: "What it should do, and the job it helps you with.",
    guidance: [
      'If it is a new page, follow "Add a page" in AGENTS.md and copy the closest example view. Inspect any warehouse relation with pnpm schema before writing SQL.',
      "If it needs to write data or act for a person, stop and explain first: this app is read-only by design (docs/auth.md).",
    ],
    changesCode: true,
  },
  {
    id: "check",
    label: "Check a number",
    lead: "Check a number on this page.",
    placeholder: "Which number, the value shown, and what you expected.",
    guidance: [
      "Compare it with an independent, authorized source (the SourceMedium MCP's query_metrics) for the same store, dates, and reporting currency.",
      "If they differ, explain why from the SQL and the catalog definition before changing anything. If no independent source is available, report the number as unverified.",
    ],
    changesCode: false,
  },
  {
    id: "ask",
    label: "Ask how it works",
    lead: "Explain how this page works.",
    placeholder: "What you want to understand.",
    guidance: ["Answer from the code and the docs. Do not change any files."],
    changesCode: false,
  },
] as const;

export type AgentIntentId = (typeof AGENT_INTENTS)[number]["id"];

export function agentIntent(id: AgentIntentId): (typeof AGENT_INTENTS)[number] {
  return AGENT_INTENTS.find((candidate) => candidate.id === id) ?? AGENT_INTENTS[0];
}

export type AgentPageContext = {
  pathname: string;
  /** The applied URL filters, as the browser shows them. */
  params: Record<string, string>;
  /** Headings and card titles in reading order; the first is the page title. */
  headings: string[];
  mode: "sample" | "live";
  build: string;
};

/** What the composer reads from the document when it opens. */
export type AgentPageSnapshot = Pick<AgentPageContext, "pathname" | "params" | "headings">;

const MAX_SECTIONS = 12;
const MAX_TEXT = 100;
const ROUTE_SEGMENT = /^[a-z0-9-]+$/;

export function composeAgentPrompt(intentId: AgentIntentId, request: string, context: AgentPageContext): string {
  const intent = agentIntent(intentId);
  const headings = [...new Set(context.headings.map((heading) => heading.trim().slice(0, MAX_TEXT)).filter(Boolean))];
  const [title = context.pathname, ...sections] = headings;
  const segment = context.pathname.slice(1);
  const filters = Object.entries(context.params).map(([key, value]) => `${key}=${value.slice(0, MAX_TEXT)}`);
  const lines = [
    intent.lead,
    "",
    request.trim() || "(Describe what you need here.)",
    "",
    "Context from the running app",
    `- Page: ${title} (${context.pathname})`,
    ...(ROUTE_SEGMENT.test(segment)
      ? [`- Code: src/features/${segment}/ holds this view's queries, row schema, SQL, sample data, and page.`]
      : []),
    `- Applied filters: ${filters.length > 0 ? filters.join(", ") : "none in the URL; the page shows its defaults"}`,
    ...(sections.length > 0 ? [`- Sections on the page: ${sections.slice(0, MAX_SECTIONS).join("; ")}`] : []),
    `- Data mode: ${context.mode === "sample" ? "sample data (synthetic; nothing from a warehouse)" : "live warehouse data"}`,
    `- App build: ${context.build}`,
    "",
    "How to work",
    "- Read AGENTS.md first and follow its five rules.",
    ...intent.guidance.map((line) => `- ${line}`),
    ...(intent.changesCode
      ? [
          "- Run pnpm check when done, and pnpm test:e2e after UI changes.",
          "- Tell me separately what you verified on sample data and what still needs live data.",
        ]
      : []),
  ];
  return lines.join("\n");
}
