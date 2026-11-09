import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { updateFromTemplate } from "../../scripts/lib/template-update";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));

/** File contents by path; null deletes the file. */
type Files = Record<string, string | null>;

const FIRST: Files = {
  ".gitignore": "node_modules\n",
  "package.json": '{ "name": "app" }\n',
  "README.md": "# App\n\nFirst line.\nSecond line.\nThird line.\n",
  "src/page.ts": "export const title = 'Overview';\n",
  "src/query.ts": "select 1\n",
  "docs/old.md": "Old guide.\n",
};

const short = (sha: string) => sha.slice(0, 7);

/**
 * A local template repository and a customer copy, both real git in a temp
 * directory. Git reads only this sandbox's empty configuration, so no global
 * hook, signing or line-ending setting changes the result, and nothing touches the network.
 */
function workspace() {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), "sm-template-update-")));
  directories.push(dir);
  const gitconfig = join(dir, "gitconfig");
  writeFileSync(gitconfig, "");
  const template = join(dir, "template");
  const customer = join(dir, "customer");
  // Child processes skip undefined variables, so an inherited GIT_DIR or SM_TEMPLATE_BASE never applies.
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const name of Object.keys(env))
    if (name.startsWith("GIT_") || name.startsWith("SM_TEMPLATE_")) env[name] = undefined;
  Object.assign(env, {
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: gitconfig,
    GIT_AUTHOR_NAME: "Test",
    GIT_AUTHOR_EMAIL: "test@example.invalid",
    GIT_COMMITTER_NAME: "Test",
    GIT_COMMITTER_EMAIL: "test@example.invalid",
    SM_TEMPLATE_URL: template,
  });
  const git = (cwd: string, ...args: string[]) =>
    execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const write = (repo: string, files: Files) => {
    for (const [path, content] of Object.entries(files)) {
      const file = join(repo, path);
      if (content === null) rmSync(file, { force: true });
      else {
        mkdirSync(dirname(file), { recursive: true });
        writeFileSync(file, content);
      }
    }
  };
  const commit = (repo: string, files: Files, message: string) => {
    write(repo, files);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", message);
    return git(repo, "rev-parse", "HEAD");
  };
  git(dir, "init", "-q", "-b", "main", template);
  const first = commit(template, FIRST, "feat: first template version");

  return {
    dir,
    template,
    customer,
    first,
    git,
    write,
    commit,
    /** GitHub's "Use this template": a new root commit holding the template's files, with no shared history. */
    useTemplate(files: Files = FIRST) {
      git(dir, "init", "-q", "-b", "main", customer);
      commit(customer, files, "Initial commit");
    },
    update(settings: Record<string, string> = {}) {
      const lines: string[] = [];
      const output = { log: (line: string) => lines.push(line), error: (line: string) => lines.push(line) };
      const status = updateFromTemplate(customer, { ...env, ...settings }, output);
      return { status, output: lines.join("\n") };
    },
    read: (path: string) => readFileSync(join(customer, path), "utf8"),
    exists: (path: string) => existsSync(join(customer, path)),
    head: () => git(customer, "rev-parse", "HEAD"),
    message: () => git(customer, "log", "-1", "--format=%B"),
    status: () => git(customer, "status", "--porcelain"),
  };
}

describe("pnpm template:update", () => {
  it("reports a copy that already matches the template", () => {
    const w = workspace();
    w.useTemplate();
    expect(w.git(w.customer, "rev-parse", "HEAD^{tree}")).toBe(w.git(w.template, "rev-parse", "HEAD^{tree}"));
    const before = w.head();

    const result = w.update();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain(`Already up to date with the template (${short(w.first)}).`);
    expect(w.head()).toBe(before);
  });

  it("brings in the template's changes as one commit and keeps the copy's own", () => {
    const w = workspace();
    w.useTemplate();
    w.commit(
      w.customer,
      {
        "README.md": "# My app\n\nFirst line.\nSecond line.\nThird line.\n",
        "src/mine.ts": "export const mine = 1;\n",
      },
      "feat: my changes",
    );
    const next = w.commit(
      w.template,
      {
        "README.md": "# App\n\nFirst line.\nSecond line.\nThird line, improved.\n",
        "src/query.ts": "select 2\n",
        "src/new.ts": "export const added = true;\n",
        "docs/old.md": null,
      },
      "feat: template improvements",
    );
    // Ignored files are not changes, so they do not block the update.
    w.write(w.customer, { "node_modules/cache.txt": "installed\n" });

    const result = w.update();
    expect(result.status, result.output).toBe(0);
    expect(w.message()).toBe(
      `chore: update from the template (${short(w.first)}..${short(next)})\n\nTemplate-Commit: ${next}`,
    );
    expect(w.read("README.md")).toBe("# My app\n\nFirst line.\nSecond line.\nThird line, improved.\n");
    expect(w.read("src/query.ts")).toBe("select 2\n");
    expect(w.read("src/new.ts")).toBe("export const added = true;\n");
    expect(w.read("src/mine.ts")).toBe("export const mine = 1;\n");
    expect(w.exists("docs/old.md")).toBe(false);
    expect(w.status()).toBe("");
    expect(result.output).toContain("4 files changed");
    expect(result.output).toContain("added src/new.ts");
    expect(result.output).toContain("deleted docs/old.md");
    expect(result.output).toContain("Next: pnpm check");
  });

  it("starts the next update from the template commit the last one recorded", () => {
    const w = workspace();
    w.useTemplate();
    const second = w.commit(w.template, { "src/query.ts": "select 2\n" }, "feat: second");
    expect(w.update().status).toBe(0);
    const third = w.commit(
      w.template,
      { "src/query.ts": "select 3\n", "package.json": '{ "name": "app", "private": true }\n' },
      "feat: third",
    );

    // From the first version, select 1 -> 3 would conflict with the copy's select 2.
    const result = w.update();
    expect(result.status, result.output).toBe(0);
    expect(w.message()).toBe(
      `chore: update from the template (${short(second)}..${short(third)})\n\nTemplate-Commit: ${third}`,
    );
    expect(w.read("src/query.ts")).toBe("select 3\n");
    expect(result.output).toContain("Next: pnpm install (dependencies changed), then pnpm check");
    expect(w.update().output).toContain(`Already up to date with the template (${short(third)}).`);
  });

  it("leaves conflict markers and no commit when both sides changed the same lines", () => {
    const w = workspace();
    w.useTemplate();
    w.commit(w.customer, { "src/page.ts": "export const title = 'My overview';\n" }, "feat: my title");
    const next = w.commit(
      w.template,
      { "src/page.ts": "export const title = 'Summary';\n", "src/query.ts": "select 2\n" },
      "feat: template title",
    );
    const before = w.head();

    const result = w.update();
    expect(result.status, result.output).toBe(1);
    expect(w.head()).toBe(before);
    expect(w.read("src/page.ts")).toMatch(
      /^<<<<<<< HEAD\nexport const title = 'My overview';\n=======\nexport const title = 'Summary';\n>>>>>>> /,
    );
    expect(w.read("src/query.ts")).toBe("select 2\n");
    expect(result.output).toContain("src/page.ts: you and the template both changed it");
    expect(result.output).toContain("The other 1 changed file applied cleanly and is staged.");
    const subject = `chore: update from the template (${short(w.first)}..${short(next)})`;
    expect(result.output).toContain(`git commit -m "${subject}" -m "Template-Commit: ${next}"`);

    // Finishing with the printed steps records the template version for the next update.
    w.write(w.customer, { "src/page.ts": "export const title = 'My summary';\n" });
    w.git(w.customer, "add", "src/page.ts");
    w.git(w.customer, "commit", "-q", "-m", subject, "-m", `Template-Commit: ${next}`);
    expect(w.update().output).toContain(`Already up to date with the template (${short(next)}).`);
  });

  it("follows a file the copy renamed and reports one it deleted", () => {
    const w = workspace();
    w.useTemplate();
    w.git(w.customer, "mv", "src/query.ts", "src/orders-query.ts");
    w.git(w.customer, "rm", "-q", "docs/old.md");
    w.git(w.customer, "commit", "-q", "-m", "refactor: my layout");
    w.commit(
      w.template,
      { "src/query.ts": "select 2\n", "docs/old.md": "Old guide, updated.\n" },
      "feat: template edits",
    );

    const result = w.update();
    expect(result.status, result.output).toBe(1);
    expect(w.read("src/orders-query.ts")).toBe("select 2\n");
    expect(w.exists("src/query.ts")).toBe(false);
    expect(result.output).toContain("docs/old.md: you deleted it and the template changed it");
    expect(result.output).toContain("git rm <file> deletes it");
  });

  it.each(["modified", "staged", "untracked"])("refuses to start with %s changes", (state) => {
    const w = workspace();
    w.useTemplate();
    w.commit(w.template, { "src/query.ts": "select 2\n" }, "feat: second");
    w.write(w.customer, state === "untracked" ? { "notes.txt": "draft\n" } : { "README.md": "# Edited\n" });
    if (state === "staged") w.git(w.customer, "add", "README.md");
    const before = w.head();

    const result = w.update();
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("Commit or stash your changes first");
    expect(result.output).toContain(state === "untracked" ? "notes.txt" : "README.md");
    expect(w.head()).toBe(before);
    expect(w.read("src/query.ts")).toBe("select 1\n");
    expect(w.exists(".git/FETCH_HEAD")).toBe(false);
  });

  it("refuses a repository whose first commit matches no template version", () => {
    const w = workspace();
    w.useTemplate({ ...FIRST, "src/extra.ts": "export {};\n" });
    w.commit(w.template, { "src/query.ts": "select 2\n" }, "feat: second");
    const before = w.head();

    const result = w.update();
    expect(result.status, result.output).toBe(1);
    expect(result.output).toContain("matches no version of the template's main");
    expect(result.output).toContain("SM_TEMPLATE_BASE=<template commit> pnpm template:update");
    expect(w.head()).toBe(before);
    expect(w.status()).toBe("");
  });

  it("takes the base from SM_TEMPLATE_BASE when it names a template commit", () => {
    const w = workspace();
    w.useTemplate({ ...FIRST, "src/extra.ts": "export {};\n" });
    const next = w.commit(w.template, { "src/query.ts": "select 2\n" }, "feat: second");

    for (const base of ["0".repeat(40), w.head(), "HEAD~1"]) {
      const refused = w.update({ SM_TEMPLATE_BASE: base });
      expect(refused.status, refused.output).toBe(1);
      expect(refused.output).toContain(
        `SM_TEMPLATE_BASE=${base} is not a commit in the history of the template's main`,
      );
    }

    const result = w.update({ SM_TEMPLATE_BASE: w.first });
    expect(result.status, result.output).toBe(0);
    expect(w.message()).toContain(`Template-Commit: ${next}`);
    expect(w.read("src/query.ts")).toBe("select 2\n");
    expect(w.read("src/extra.ts")).toBe("export {};\n");
  });

  it("uses the shared history when the copy is a clone of the template", () => {
    const w = workspace();
    const second = w.commit(w.template, { "src/query.ts": "select 2\n" }, "feat: second");
    w.git(w.dir, "clone", "-q", w.template, w.customer);
    w.commit(w.customer, { "src/mine.ts": "export const mine = 1;\n" }, "feat: mine");
    const third = w.commit(w.template, { "src/query.ts": "select 3\n" }, "feat: third");

    const result = w.update();
    expect(result.status, result.output).toBe(0);
    expect(w.message()).toContain(`(${short(second)}..${short(third)})`);
    expect(w.read("src/query.ts")).toBe("select 3\n");
  });

  it("records the template version when the copy already has the template's changes", () => {
    const w = workspace();
    w.useTemplate();
    w.commit(w.customer, { "src/query.ts": "select 2\n" }, "fix: same as the template");
    const next = w.commit(w.template, { "src/query.ts": "select 2\n" }, "feat: second");

    const result = w.update();
    expect(result.status, result.output).toBe(0);
    expect(result.output).toContain("already had these changes");
    expect(w.message()).toContain(`Template-Commit: ${next}`);
    expect(w.git(w.customer, "diff", "HEAD~1", "HEAD")).toBe("");
    expect(w.update().output).toContain(`Already up to date with the template (${short(next)}).`);
  });
});
