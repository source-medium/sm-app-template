/**
 * Every guardrail exists, fails on a deliberate violation,
 * and says in one sentence which file is wrong and how to fix it.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, sep } from "node:path";
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

  it("catches server actions inside a component and loaders wrapped in cache()", () => {
    const gaps = findAuthGaps([
      {
        path: "src/features/x/page.tsx",
        text: 'export default function P() {\n  async function act() { "use server"; }\n  return <form action={act} />;\n}',
      },
      {
        path: "src/features/x/bigquery.ts",
        text: 'import { cache } from "react";\nexport const load = cache(async () => 1);',
      },
    ]);
    expect(gaps).toEqual([
      "`src/features/x/page.tsx:2` defines the server action `act`, which runs without calling `requireViewer()`; call `await requireViewer()` first in it.",
      "`src/features/x/bigquery.ts` exports `load`, which reads data without calling `requireViewer()`; call `await requireViewer()` first.",
    ]);
  });

  it("keeps requireViewer() the only way to reach the warehouse", () => {
    const warehouse = { path: "src/lib/data/warehouse.server.ts", text: "export function warehouseFor() {}" };
    expect(
      findAuthGaps([
        warehouse,
        { path: "src/app/(app)/x/page.tsx", text: 'import { warehouseFor } from "@/lib/data/warehouse.server";' },
        {
          path: "src/lib/y.ts",
          text: 'export async function y() { return (await import("@/lib/data/warehouse.server")).warehouseFor; }',
        },
        { path: "src/lib/data/x.ts", text: 'import type { Warehouse } from "./warehouse.server";' },
        { path: "src/lib/data/z.ts", text: 'export type W = typeof import("./warehouse.server");' },
      ]),
    ).toEqual([
      "`src/app/(app)/x/page.tsx` imports `src/lib/data/warehouse.server.ts`, which reaches the warehouse without `requireViewer()`; take the warehouse from `await requireViewer({ live: true })` in a feature's bigquery.ts instead.",
      "`src/lib/y.ts` imports `src/lib/data/warehouse.server.ts`, which reaches the warehouse without `requireViewer()`; take the warehouse from `await requireViewer({ live: true })` in a feature's bigquery.ts instead.",
    ]);
  });

  it("keeps connection diagnostics behind the warehouse guard", () => {
    const gaps = findAuthGaps([
      { path: "src/lib/data/connection.server.ts", text: "export function checkWarehouseConnection() {}" },
      {
        path: "src/app/unsafe/route.ts",
        text: 'import { checkWarehouseConnection } from "@/lib/data/connection.server"; export async function POST() { return checkWarehouseConnection(); }',
      },
    ]);
    expect(gaps.some((gap) => gap.includes("imports `src/lib/data/connection.server.ts`"))).toBe(true);
    expect(gaps.some((gap) => gap.includes("without calling `requireViewer()`"))).toBe(true);
  });

  it("follows a guarded handler in the same file exported under a method name", () => {
    const handler =
      'import { requireViewer } from "@/lib/auth/require-viewer"; async function handler() { await requireViewer(); return new Response(""); }\n';
    expect(findAuthGaps([{ path: "src/app/a/route.ts", text: `${handler}export { handler as GET };` }])).toEqual([]);
    expect(findAuthGaps([{ path: "src/app/b/route.ts", text: `${handler}export const GET = handler;` }])).toEqual([]);
  });

  it("follows route handlers that are re-exported or aliased from another module", () => {
    const unguarded = {
      path: "src/features/orders/csv.ts",
      text: "export async function csvGET() { return new Response(await rows()); }",
    };
    const guarded = {
      path: "src/features/orders/safe.ts",
      text: 'import { requireViewer } from "@/lib/auth/require-viewer"; export async function safeGET() { await requireViewer(); return new Response(""); }',
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
          text: 'import { requireViewer } from "@/lib/auth/require-viewer"; export async function load() { const { warehouse } = await requireViewer({ live: true }); }',
        },
        { path: "src/features/a/queries.ts", text: "export function encode(x: string) { return x; }" },
        { path: "src/app/healthz/route.ts", text: "export function GET() { return new Response('ok'); }" },
      ]),
    ).toEqual([]);
  });

  it("accepts store scope from loader parameters without allowing work before the guard", () => {
    for (const [parameter, argument] of [
      ["filters", "storeId: filters.storeId"],
      ["storeId", "storeId"],
    ]) {
      expect(
        findAuthGaps([
          {
            path: "src/features/x/bigquery.ts",
            text: `import { requireViewer } from "@/lib/auth/require-viewer"; export async function load(${parameter}) { await requireViewer({ live: true, ${argument} }); }`,
          },
        ]),
      ).toEqual([]);
    }
    for (const argument of [
      "storeId: lookup()",
      "storeId: await rows()",
      "...options",
      'storeId: "hard-coded"',
      "storeId: globalScope.storeId",
    ]) {
      expect(
        findAuthGaps([
          {
            path: "src/features/x/bigquery.ts",
            text: `import { requireViewer } from "@/lib/auth/require-viewer"; export async function load(filters) { await requireViewer({ ${argument} }); }`,
          },
        ]),
      ).toHaveLength(1);
    }
  });

  it.each([
    "const guard = () => requireViewer(); return 1;",
    "await requireViewer().catch(() => null); return 1;",
    "try { await requireViewer(); } catch {} return 1;",
    "if (false) await requireViewer(); return 1;",
    "requireViewer(); return 1;",
    "await rows(); await requireViewer();",
    "const ignored = rows(), viewer = await requireViewer();",
    "const requireViewer = async () => null; await requireViewer();",
    "await requireViewer({ live: await rows() });",
  ])("rejects ineffective guards: %s", (body) => {
    expect(
      findAuthGaps([
        {
          path: "src/app/x/route.ts",
          text: `import { requireViewer } from "@/lib/auth/require-viewer"; export async function GET() { ${body} }`,
        },
      ]),
    ).toHaveLength(1);
  });

  it("resolves the guard binding and rejects shadowing, fake imports and parameter side effects", () => {
    for (const text of [
      "export async function GET() { await requireViewer(); }",
      'import { requireViewer } from "./fake"; export async function GET() { await requireViewer(); }',
      'import { requireViewer } from "@/lib/auth/require-viewer"; export async function GET(requireViewer) { await requireViewer(); }',
      'import { requireViewer } from "@/lib/auth/require-viewer"; export async function GET(x = rows()) { await requireViewer(); }',
    ])
      expect(findAuthGaps([{ path: "src/app/x/route.ts", text }])).toHaveLength(1);
  });

  it("accepts the canonical guard imported under an alias and a React cache wrapper", () => {
    expect(
      findAuthGaps([
        {
          path: "src/features/x/queries.ts",
          text: 'import { requireViewer as guard } from "../../lib/auth/require-viewer"; import { cache } from "react"; export const load = cache(async () => { const viewer = await guard(); return viewer; });',
        },
      ]),
    ).toEqual([]);
  });

  it("follows re-exported loaders and actions, including default actions and export stars", () => {
    const helper = { path: "src/lib/helper.ts", text: "export async function unsafe() {}" };
    for (const path of ["src/app/actions.ts", "src/features/x/queries.ts"]) {
      for (const exported of [
        'export { unsafe as save } from "@/lib/helper";',
        'export * from "@/lib/helper";',
        'import { unsafe } from "@/lib/helper"; export const save = unsafe;',
        "export default async function () {}",
      ])
        expect(findAuthGaps([helper, { path, text: '"use server"; ' + exported }])).toHaveLength(1);
    }
  });

  it("checks nested actions even in use-server files", () => {
    expect(
      findAuthGaps([
        {
          path: "src/app/actions.ts",
          text: '"use server"; import { requireViewer } from "@/lib/auth/require-viewer"; export async function outer() { await requireViewer(); async function inner() { "use server"; } }',
        },
      ]),
    ).toHaveLength(1);
  });

  it.each([
    'const path = "./warehouse.server"; export const load = () => import(path);',
    'const load = require; export const warehouse = load("./warehouse.server");',
    'export const warehouse = require("./warehouse.server");',
    'import { createRequire } from "node:module";',
    'import warehouse = require("./warehouse.server");',
    'import "./warehouse.server";',
    'export * from "./warehouse.server";',
  ])("rejects hidden warehouse access: %s", (text) => {
    expect(
      findAuthGaps([
        { path: "src/lib/data/warehouse.server.ts", text: "export function warehouseFor() {}" },
        { path: "src/lib/data/helper.ts", text },
      ]).length,
    ).toBeGreaterThan(0);
  });

  it("rejects source extensions outside the typed and guarded contract", () => {
    for (const path of ["src/app/x/route.js", "src/lib/helper.mjs", "src/lib/helper.cts"]) {
      expect(findAuthGaps([{ path, text: "export const data = 1" }])[0]).toContain("use .ts or .tsx");
    }
  });

  it("recognizes use-server anywhere in the directive prologue", () => {
    expect(
      findAuthGaps([
        { path: "src/app/actions.ts", text: '"use strict"; "use server"; export async function save() {}' },
      ]),
    ).toHaveLength(1);
    expect(
      findAuthGaps([
        { path: "src/features/x/page.tsx", text: 'async function save() { "use strict"; "use server"; }' },
      ]),
    ).toHaveLength(1);
  });

  it("passes on this repository's own source", () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
        entry.isDirectory()
          ? walk(join(dir, entry.name))
          : /\.[cm]?[jt]sx?$/.test(entry.name)
            ? [join(dir, entry.name)]
            : [],
      );
    const files = walk("src").map((path) => ({ path: path.split(sep).join("/"), text: readFileSync(path, "utf8") }));
    expect(files.some((file) => file.path.startsWith("src/features/"))).toBe(true);
    expect(findAuthGaps(files)).toEqual([]);
  });
});

describe("lint rules", () => {
  tester.run("no-client-locale-format", template.rules["no-client-locale-format"], {
    valid: ["const n = value.toLocaleString();", '"use client";\nconst s = String(value);'],
    invalid: [
      { code: '"use client";\nconst s = value.toLocaleString();', errors: [{ messageId: "locale" }] },
      { code: '"use client";\nconst f = new Intl.DateTimeFormat("en");', errors: [{ messageId: "locale" }] },
      { code: '"use client";\nconst f = new Intl.NumberFormat("en");', errors: [{ messageId: "locale" }] },
      { code: "const n = value.toLocaleString();", options: [{ everywhere: true }], errors: [{ messageId: "locale" }] },
      { code: '"use client";\nimport { formatMoney } from "@/lib/format";', errors: [{ messageId: "serverImport" }] },
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
    expect(loader["template/no-client-locale-format"]).toEqual([2, { everywhere: true }]);
    expect((await rulesFor("src/lib/format.ts"))["template/no-client-locale-format"]).toEqual([2]);
    expect(loader["@typescript-eslint/no-floating-promises"]).toEqual([2]);
    expect(loader["jsx-a11y/alt-text"]).toBeDefined();
    expect(loader["react-hooks/rules-of-hooks"]).toBeDefined();
    expect((await rulesFor("src/lib/config/env.server.ts"))["template/no-process-env"]).toBeUndefined();
    expect((await rulesFor("src/lib/data/anything.server.ts"))["template/server-only-import"]).toEqual([2]);
    expect((await rulesFor("src/lib/data/anything.server.tsx"))["template/server-only-import"]).toEqual([2]);
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

describe("agent file permissions", () => {
  it("denies environment variants at any depth while keeping the example readable", () => {
    // Claude Read rules use gitignore semantics. Test names only, never real env files.
    const settings = JSON.parse(readFileSync(".claude/settings.json", "utf8")) as {
      permissions: { deny: string[] };
    };
    const patterns = settings.permissions.deny.flatMap((rule) => rule.match(/^Read\((.*)\)$/)?.slice(1) ?? []);
    const blocked = [
      ".env",
      ".env.local",
      ".env.preview",
      ".env.local.bak",
      ".envrc",
      ".env-backup",
      ".dev.vars",
      ".dev.vars.production",
      ".dev.vars-backup",
    ];
    const allowed = [".env.example", "README.md", "src/app.ts"];
    const cases = ["", "nested/"].flatMap((prefix) => [
      ...blocked.map((name) => ({ path: prefix + name, denied: true })),
      ...allowed.map((name) => ({ path: prefix + name, denied: false })),
    ]);
    const dir = mkdtempSync(join(tmpdir(), "agent-permissions-"));
    try {
      execFileSync("git", ["init", "--quiet", dir]);
      writeFileSync(join(dir, ".gitignore"), patterns.join("\n") + "\n");
      const denied = new Set(
        execFileSync("git", ["check-ignore", "--no-index", "--stdin", "-z"], {
          cwd: dir,
          input: cases.map(({ path }) => path).join("\0") + "\0",
          encoding: "utf8",
        }).split("\0"),
      );
      for (const item of cases) expect(denied.has(item.path), item.path).toBe(item.denied);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("skill copies", () => {
  const dir = mkdtempSync(join(tmpdir(), "skills-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("fail with the sync instruction when a copy drifts, and pass after syncing", () => {
    mkdirSync(join(dir, ".agents/skills/sm-data"), { recursive: true });
    writeFileSync(join(dir, ".agents/skills/sm-data/SKILL.md"), "---\nname: sm-data\n---\nCanonical.\n");
    expect(skillDifferences(dir)).toEqual([
      "`.claude/skills/sm-data/SKILL.md` differs from `.agents/skills/sm-data/SKILL.md`; make the change in `.agents/skills/sm-data/SKILL.md` (sync overwrites the copy), then run `pnpm skills:sync`.",
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
