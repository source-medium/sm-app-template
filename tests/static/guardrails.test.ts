/**
 * Every guardrail exists, fails on a deliberate violation,
 * and says in one sentence which file is wrong and how to fix it.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ESLint, RuleTester } from "eslint";
import tseslint from "typescript-eslint";
import { afterAll, describe, expect, it } from "vitest";
import template from "../../eslint-rules/index.mjs";
import { findAuthGaps } from "../../scripts/lib/auth-coverage";
import { skillDifferences, syncSkills } from "../../scripts/lib/skills";

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;
const tester = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

describe("auth-coverage", () => {
  it("names the file, the function, and the fix for a loader that skips requireViewer()", () => {
    const gaps = findAuthGaps([
      {
        path: "src/features/sales/bigquery.ts",
        text: "export async function loadSales() { return warehouse.query({ sql: 'SELECT 1' }); }",
      },
    ]);
    expect(gaps).toEqual([
      "`src/features/sales/bigquery.ts` exports `loadSales`, which reads data without calling `requireViewer()`; call `await requireViewer()` first.",
    ]);
  });

  it("catches route handlers, server-action files, and inline server actions", () => {
    const gaps = findAuthGaps([
      {
        path: "src/app/api/export/route.ts",
        text: "export async function GET() { return Response.json(await rows()); }",
      },
      { path: "src/app/actions.ts", text: '"use server";\nexport async function save() {}' },
      {
        path: "src/features/x/page.tsx",
        text: 'async function act() { "use server"; await write(); }\nexport default function P() { return null; }',
      },
    ]);
    expect(gaps).toHaveLength(3);
    expect(gaps[0]).toContain("`src/app/api/export/route.ts` exports `GET`, which handles requests");
    expect(gaps[2]).toContain("`act`");
  });

  it("follows route handlers that are re-exported or aliased from another module", () => {
    const unguarded = {
      path: "src/features/orders/csv.ts",
      text: "export async function csvGET() { return new Response(await rows()); }",
    };
    const guarded = {
      path: "src/features/orders/safe.ts",
      text: "export async function safeGET() { await requireViewer(); return new Response(''); }",
    };
    expect(
      findAuthGaps([
        unguarded,
        { path: "src/app/(app)/orders/csv/route.ts", text: 'export { csvGET as GET } from "@/features/orders/csv";' },
      ]),
    ).toEqual([
      "`src/app/(app)/orders/csv/route.ts` exports `GET`, which handles requests without calling `requireViewer()`; call `await requireViewer()` first.",
    ]);
    expect(
      findAuthGaps([
        unguarded,
        {
          path: "src/app/x/route.ts",
          text: 'import { csvGET } from "../../features/orders/csv";\nexport const GET = csvGET;',
        },
      ]),
    ).toHaveLength(1);
    expect(
      findAuthGaps([
        unguarded,
        {
          path: "src/app/x/route.ts",
          text: 'export * from "@/features/orders/csv";\nexport { csvGET as GET } from "@/features/orders/csv";',
        },
      ]),
    ).toHaveLength(1);
    expect(
      findAuthGaps([
        guarded,
        { path: "src/app/y/route.ts", text: 'export { safeGET as GET } from "@/features/orders/safe";' },
      ]),
    ).toEqual([]);
    const wrapped = findAuthGaps([
      { path: "src/app/z/route.ts", text: 'import { wrap } from "some-package";\nexport const GET = wrap(handler);' },
    ]);
    expect(wrapped).toEqual([
      "`src/app/z/route.ts` exports `GET` in a form the auth check cannot follow; define it as a function in this repository that calls `await requireViewer()` first.",
    ]);
  });

  it("passes guarded loaders, sync helpers, and documented public routes", () => {
    expect(
      findAuthGaps([
        {
          path: "src/features/a/bigquery.ts",
          text: "export async function load() { const { warehouse } = await requireViewer({ live: true }); }",
        },
        { path: "src/features/a/queries.ts", text: "export function encode(x: string) { return x; }" },
        { path: "src/app/healthz/route.ts", text: "export function GET() { return new Response('ok'); }" },
      ]),
    ).toEqual([]);
  });

  it("passes on this repository's own source", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory() ? walk(join(dir, entry.name)) : /\.tsx?$/.test(entry.name) ? [join(dir, entry.name)] : [],
      );
    expect(findAuthGaps(walk("src").map((path) => ({ path, text: readFileSync(path, "utf8") })))).toEqual([]);
  });
});

describe("lint rules", () => {
  tester.run("no-client-locale-format", template.rules["no-client-locale-format"], {
    valid: ["const n = value.toLocaleString();", '"use client";\nconst s = String(value);'],
    invalid: [
      { code: '"use client";\nconst s = value.toLocaleString();', errors: [{ messageId: "locale" }] },
      { code: '"use client";\nconst f = new Intl.DateTimeFormat("en");', errors: [{ messageId: "locale" }] },
      { code: '"use client";\nconst f = new Intl.NumberFormat("en");', errors: [{ messageId: "locale" }] },
    ],
  });
  tester.run("no-process-env", template.rules["no-process-env"], {
    valid: ["const config = readConfig();"],
    invalid: [{ code: "const key = process.env.SM_APP_KEY;", errors: [{ messageId: "env" }] }],
  });
  tester.run("server-only-import", template.rules["server-only-import"], {
    valid: ['import "server-only";\nexport const x = 1;'],
    invalid: [{ code: "export const secret = 1;", errors: [{ messageId: "missing" }] }],
  });

  it("each message names the fix", () => {
    for (const rule of Object.values(template.rules)) {
      for (const message of Object.values(rule.meta.messages)) expect(message).toMatch(/; [a-z]/);
    }
  });

  it("the config applies each rule where it belongs", async () => {
    const eslint = new ESLint();
    const rulesFor = async (path: string) =>
      ((await eslint.calculateConfigForFile(path)) as { rules: Record<string, unknown> }).rules;
    const loader = await rulesFor("src/features/sales/bigquery.ts");
    expect(loader["template/no-process-env"]).toEqual([2]);
    expect(loader["template/no-client-locale-format"]).toEqual([2]);
    expect(loader["@typescript-eslint/no-floating-promises"]).toEqual([2]);
    expect(loader["jsx-a11y/alt-text"]).toBeDefined();
    expect(loader["react-hooks/rules-of-hooks"]).toBeDefined();
    expect((await rulesFor("src/lib/config/env.server.ts"))["template/no-process-env"]).toBeUndefined();
    expect((await rulesFor("src/lib/data/anything.server.ts"))["template/server-only-import"]).toEqual([2]);
  });
});

describe("types", () => {
  it("are strict with noUncheckedIndexedAccess", () => {
    const options = (JSON.parse(readFileSync("tsconfig.json", "utf8")) as { compilerOptions: Record<string, unknown> })
      .compilerOptions;
    expect(options.strict).toBe(true);
    expect(options.noUncheckedIndexedAccess).toBe(true);
  });
});

describe("skill copies", () => {
  const dir = mkdtempSync(join(tmpdir(), "skills-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("fail with the sync instruction when a copy drifts, and pass after syncing", () => {
    mkdirSync(join(dir, ".agents/skills/sm-data"), { recursive: true });
    writeFileSync(join(dir, ".agents/skills/sm-data/SKILL.md"), "---\nname: sm-data\n---\nCanonical.\n");
    expect(skillDifferences(dir)).toEqual([
      "`.claude/skills/sm-data/SKILL.md` differs from `.agents/skills/sm-data/SKILL.md`; run `pnpm skills:sync`.",
    ]);
    syncSkills(dir);
    expect(skillDifferences(dir)).toEqual([]);
    writeFileSync(join(dir, ".claude/skills/sm-data/SKILL.md"), "edited the copy\n");
    expect(skillDifferences(dir)).toHaveLength(1);
  });

  it("match byte for byte in this repository", () => {
    expect(skillDifferences(".")).toEqual([]);
  });
});
