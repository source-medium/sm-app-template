/**
 * pnpm check: the one command to run before declaring a change done.
 * Format, lint, types, auth coverage, skill copies, and every test
 * (including the invariants, in Node and workerd), run side by side. Each
 * failure is one sentence naming the file and the fix.
 */
import { spawn } from "node:child_process";
import { findAuthGaps } from "./lib/auth-coverage";
import { root } from "./lib/environment";
import { skillDifferences } from "./lib/skills";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

type Step = { name: string; run: () => Promise<string[]> | string[] };

function command(args: string[], explain: (output: string) => string[]): () => Promise<string[]> {
  return () =>
    new Promise((resolve, reject) => {
      const child = spawn("pnpm", ["exec", ...args], {
        cwd: root,
        // Windows resolves pnpm.cmd only through a shell.
        shell: process.platform === "win32",
        env: { ...process.env, FORCE_COLOR: "0", NO_COLOR: "1" },
      });
      let output = "";
      child.stdout.on("data", (chunk: Buffer) => (output += chunk.toString()));
      child.stderr.on("data", (chunk: Buffer) => (output += chunk.toString()));
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) return resolve([]);
        // Strip color codes so the messages below can be parsed and read.
        // eslint-disable-next-line no-control-regex
        const plain = output.replace(/\x1b\[[0-9;]*m/g, "");
        const explained = explain(plain);
        resolve(explained.length > 0 ? explained : [plain.trim()]);
      });
    });
}

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const steps: Step[] = [
  {
    name: "format",
    run: command(["prettier", "--check", "--cache", "."], (output) =>
      [...output.matchAll(/^\[warn\] (?!Code style)(.+)$/gm)].map(
        (match) => `\`${match[1]}\` is not formatted; run \`pnpm format\`.`,
      ),
    ),
  },
  {
    name: "lint",
    run: command(["eslint", "--cache", "--max-warnings", "0", "--format", "json", "."], (output) => {
      const start = output.indexOf("[");
      if (start < 0) return [];
      const results = JSON.parse(output.slice(start, output.lastIndexOf("]") + 1)) as {
        filePath: string;
        messages: { line: number; message: string; ruleId: string | null }[];
      }[];
      return results.flatMap((result) =>
        result.messages.map(
          (message) =>
            `\`${relative(root, result.filePath)}:${message.line}\`: ${message.message.split("\n")[0]}${message.ruleId ? ` (${message.ruleId})` : ""}`,
        ),
      );
    }),
  },
  {
    name: "types",
    run: command(["tsc", "--noEmit", "-p", "tsconfig.typecheck.json"], (output) =>
      [...output.matchAll(/^(.+?)\((\d+),\d+\): error (TS\d+): (.+)$/gm)].map(
        (match) => `\`${match[1]}:${match[2]}\`: ${match[4]} (${match[3]}); fix the type error at that line.`,
      ),
    ),
  },
  {
    name: "auth-coverage",
    run: () =>
      findAuthGaps(
        sourceFiles(join(root, "src")).map((path) => ({
          path: relative(root, path),
          text: readFileSync(path, "utf8"),
        })),
      ),
  },
  { name: "skills", run: () => skillDifferences(root) },
  {
    name: "tests",
    run: command(["vitest", "run", "--reporter", "dot"], (output) =>
      [...output.matchAll(/FAIL\s+\|[^|]+\|\s+(.+?) > (.+)$/gm)].map(
        (match) =>
          `\`${match[1]}\` failed "${match[2]?.trim()}"; run \`pnpm test\` for the details and fix the code (or the test if it is wrong).`,
      ),
    ),
  },
];

const started = Date.now();
const results = await Promise.all(
  steps.map(async (step) => {
    const stepStarted = Date.now();
    const problems = await step.run();
    return { step, problems, seconds: ((Date.now() - stepStarted) / 1000).toFixed(1) };
  }),
);
let failed = false;
for (const { step, problems, seconds } of results) {
  if (problems.length === 0) {
    console.log(`✓ ${step.name} (${seconds}s)`);
    continue;
  }
  failed = true;
  console.error(`✗ ${step.name} (${seconds}s)`);
  for (const problem of [...new Set(problems)]) console.error(`  ${problem}`);
}
if (failed) process.exit(1);
console.log(`pnpm check passed in ${((Date.now() - started) / 1000).toFixed(1)}s.`);
