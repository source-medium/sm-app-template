/**
 * pnpm template:update (docs/managed.md#update-from-the-template): bring the
 * template's newer changes into this copy as one commit, keeping yours.
 *
 * A copy made with GitHub's "Use this template" shares no history with the
 * template, so the template commit it last matched (the base) comes from, in
 * order: SM_TEMPLATE_BASE; the newest `Template-Commit:` trailer an earlier
 * update recorded, or the merge base when the copy is a clone of the template;
 * otherwise the template commit whose tree equals this repository's first
 * commit. The template's changes from that base to its latest commit are then
 * cherry-picked onto HEAD as a three-way merge: files you never touched update
 * cleanly, renames are followed, and overlapping edits conflict.
 *
 * It never changes git configuration or remotes and never pushes; the fetch
 * names the template's URL directly and writes only FETCH_HEAD.
 */
import { spawnSync } from "node:child_process";

export const TEMPLATE_URL = "https://github.com/source-medium/sm-app-template.git";
export const TEMPLATE_REF = "main";
const TRAILER = "Template-Commit";
const SHA = /^[0-9a-f]{40}$/;
/** Dependency files whose change means the person should reinstall before checking. */
const DEPENDENCY_FILES = new Set(["package.json", "pnpm-lock.yaml"]);
/** Author of the unreferenced commit that carries the template's changes; it is never committed or pushed. */
const PICK_IDENTITY = {
  GIT_AUTHOR_NAME: "sm-app-template",
  GIT_AUTHOR_EMAIL: "template@sourcemedium.invalid",
  GIT_COMMITTER_NAME: "sm-app-template",
  GIT_COMMITTER_EMAIL: "template@sourcemedium.invalid",
};
const LISTED = 40;

type Env = NodeJS.ProcessEnv;
export type Output = { log(line: string): void; error(line: string): void };

/** A plain stop: the message says what is wrong and what to do; no stack trace. */
class Stop extends Error {}

type Git = ReturnType<typeof gitIn>;

function gitIn(cwd: string, env: Env) {
  const run = (args: string[], options: { env?: Record<string, string>; inherit?: boolean } = {}) => {
    const result = spawnSync("git", args, {
      cwd,
      env: { ...env, ...options.env },
      encoding: "utf8",
      windowsHide: true,
      maxBuffer: 256 * 1024 * 1024,
      stdio: options.inherit ? "inherit" : "pipe",
    });
    if (result.error) throw new Stop(`Could not run git (${result.error.message}). Install Git, then try again.`);
    return { status: result.status, stdout: result.stdout ?? "", stderr: result.stderr ?? "" };
  };
  /** Trimmed output of a git command that must succeed. */
  const ok = (args: string[], env?: Record<string, string>) => {
    const result = run(args, { env });
    if (result.status !== 0) throw new Stop(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
    return result.stdout.trim();
  };
  const isAncestor = (ancestor: string, commit: string) =>
    run(["merge-base", "--is-ancestor", ancestor, commit]).status === 0;
  return { run, ok, isAncestor };
}

const short = (sha: string) => sha.slice(0, 7);

/** Updates the repository at `cwd` from the template and returns the process exit code. */
export function updateFromTemplate(cwd: string, env: Env = process.env, output: Output = console): number {
  try {
    return update(gitIn(cwd, env), env, output);
  } catch (error) {
    if (!(error instanceof Stop)) throw error;
    output.error(error.message);
    return 1;
  }
}

function update(git: Git, env: Env, output: Output): number {
  checkRepository(git);

  const url = env.SM_TEMPLATE_URL?.trim() || TEMPLATE_URL;
  const ref = env.SM_TEMPLATE_REF?.trim() || TEMPLATE_REF;
  if (!/^[\w./-]+$/.test(ref) || ref.startsWith("-"))
    throw new Stop(`SM_TEMPLATE_REF must name one branch, tag or commit of the template, not "${ref}".`);
  const source = `the template's ${ref} (${url})`;
  output.log(`Fetching ${source}…`);
  const fetched = git.run(["fetch", "--quiet", "--no-tags", "--write-fetch-head", "--", url, ref]);
  if (fetched.status !== 0)
    throw new Stop(
      `Could not fetch ${source}: ${fetched.stderr.trim()}\nCheck your network connection, then try again.`,
    );
  const next = git.ok(["rev-parse", "--verify", "FETCH_HEAD^{commit}"]);

  const base = findBase(git, env, next, source);
  // Commits with the same tree have the same content, so there is nothing to bring in.
  if (git.ok(["rev-parse", `${base}^{tree}`]) === git.ok(["rev-parse", `${next}^{tree}`])) {
    output.log(`Already up to date with the template (${short(next)}).`);
    return 0;
  }

  const subject = `chore: update from the template (${short(base)}..${short(next)})`;
  const trailer = `${TRAILER}: ${next}`;
  // A commit holding the template's latest tree with the base as its parent:
  // cherry-picking it merges exactly the template's changes from base to next
  // into HEAD, with rename detection. It stays unreferenced in this clone.
  // Its message becomes git's default if the person finishes with `git commit`.
  const pick = git.ok(
    ["commit-tree", "--no-gpg-sign", "-p", base, "-m", subject, "-m", trailer, `${next}^{tree}`],
    PICK_IDENTITY,
  );
  const picked = git.run(["cherry-pick", "--no-commit", pick]);
  const conflicts = unmergedPaths(git);
  if (picked.status !== 0 && conflicts.length === 0)
    throw new Stop(
      [
        "The template's changes could not be applied:",
        (picked.stderr || picked.stdout).trim(),
        "Run git status to see what changed; git reset --hard returns to your last commit.",
      ].join("\n"),
    );
  const changes = stagedChanges(git);
  const dependencies = changes.some((change) => change.paths.some((path) => DEPENDENCY_FILES.has(path)));

  if (conflicts.length > 0) {
    const lines = [
      `The template's changes (${short(base)}..${short(next)}) conflict with yours in ${plural(conflicts.length, "file")}:`,
      ...conflicts.map(({ path, reason }) => `  ${path}: ${reason}`),
    ];
    const clean = changes.length - conflicts.length;
    if (clean > 0)
      lines.push(
        `The other ${plural(clean, "changed file")} applied cleanly and ${clean === 1 ? "is" : "are"} staged.`,
      );
    lines.push(
      "Nothing is committed yet. To finish:",
      "  1. In each file above, keep what you want between the <<<<<<< and >>>>>>> markers and delete the markers.",
      "     For a file one side deleted, git rm <file> deletes it and git add <file> keeps it.",
    );
    if (conflicts.some(({ path }) => path === "pnpm-lock.yaml"))
      lines.push(
        "     For pnpm-lock.yaml, run git checkout --theirs pnpm-lock.yaml, settle package.json, then run pnpm install.",
      );
    lines.push(
      "  2. git add <each resolved file>",
      `  3. git commit -m "${subject}" -m "${trailer}"`,
      `  4. ${dependencies ? "pnpm install, then pnpm check" : "pnpm check"}, then review the commit and push it.`,
      "To cancel the update instead, run git reset --hard.",
    );
    for (const line of lines) output.error(line);
    return 1;
  }

  const commit = git.run(
    ["commit", "--quiet", ...(changes.length === 0 ? ["--allow-empty"] : []), "-m", subject, "-m", trailer],
    { inherit: true },
  );
  if (commit.status !== 0)
    throw new Stop(
      `git commit did not finish (see above). The template's changes are staged; commit them with:\n  git commit -m "${subject}" -m "${trailer}"`,
    );
  output.log(
    `Updated from the template (${short(base)}..${short(next)}) in commit ${short(git.ok(["rev-parse", "HEAD"]))}, ${plural(changes.length, "file")} changed${changes.length > 0 ? ":" : "."}`,
  );
  for (const change of changes.slice(0, LISTED)) output.log(`  ${change.line}`);
  if (changes.length > LISTED)
    output.log(`  …and ${changes.length - LISTED} more (git show --stat HEAD lists them all).`);
  if (changes.length === 0)
    output.log(
      "This repository already had these changes; the commit records the template version for the next update.",
    );
  output.log(
    `Next: ${dependencies ? "pnpm install (dependencies changed), then pnpm check" : "pnpm check"}, then review the commit and push it.`,
  );
  return 0;
}

function checkRepository(git: Git): void {
  const prefix = git.run(["rev-parse", "--show-prefix"]);
  if (prefix.status !== 0)
    throw new Stop("This app is not in a git repository. Run pnpm template:update in your app's repository.");
  if (prefix.stdout.trim())
    throw new Stop(
      `This app is in the folder ${prefix.stdout.trim()} of its repository. pnpm template:update only updates an app at the top of its repository, as the template creates it.`,
    );
  if (git.run(["rev-parse", "--verify", "--quiet", "HEAD^{commit}"]).status !== 0)
    throw new Stop("This repository has no commits yet, so there is nothing to update.");
  if (git.ok(["rev-parse", "--is-shallow-repository"]) === "true")
    throw new Stop(
      "This clone has only part of its history, and the update needs all of it. Run git fetch --unshallow, then pnpm template:update again.",
    );
  const status = git.run(["status", "--porcelain", "--untracked-files=normal"]);
  if (status.status !== 0) throw new Stop(`git status failed: ${status.stderr.trim()}`);
  const dirty = status.stdout.split("\n").filter(Boolean);
  if (dirty.length > 0)
    throw new Stop(
      [
        "Commit or stash your changes first, so the template's changes stay separate from yours:",
        ...dirty.slice(0, 10).map((line) => `  ${line}`),
        ...(dirty.length > 10 ? [`  …and ${dirty.length - 10} more (git status lists them all).`] : []),
      ].join("\n"),
    );
}

/** The template commit this repository last matched. */
function findBase(git: Git, env: Env, next: string, source: string): string {
  const named = env.SM_TEMPLATE_BASE?.trim();
  if (named) {
    const resolved = /^[0-9a-f]{7,40}$/i.test(named)
      ? git.run(["rev-parse", "--verify", "--quiet", `${named}^{commit}`])
      : undefined;
    const commit = resolved?.status === 0 ? resolved.stdout.trim() : undefined;
    if (!commit || !git.isAncestor(commit, next))
      throw new Stop(
        `SM_TEMPLATE_BASE=${named} is not a commit in the history of ${source}. Name the template commit this repository last matched.`,
      );
    return commit;
  }

  const recorded = git
    .ok(["log", `--format=%(trailers:key=${TRAILER},valueonly)`, "HEAD"])
    .split("\n")
    .map((line) => line.trim().toLowerCase())
    .find((line) => SHA.test(line));
  const shared = git.run(["merge-base", "HEAD", next]);
  const mergeBase = shared.status === 0 ? shared.stdout.trim() : undefined;
  if (recorded) {
    if (!git.isAncestor(recorded, next))
      throw new Stop(
        `Your last template update recorded template commit ${short(recorded)}, which is not in the history of ${source}. Run SM_TEMPLATE_BASE=<template commit> pnpm template:update with the template commit this repository last matched.`,
      );
    // A clone that later merged the template directly can have a newer merge base.
    return mergeBase && git.isAncestor(recorded, mergeBase) ? mergeBase : recorded;
  }
  if (mergeBase) return mergeBase;

  const roots = git.ok(["rev-list", "--max-parents=0", "HEAD"]).split("\n").filter(Boolean);
  if (roots.length !== 1)
    throw new Stop(
      `This repository has ${roots.length} first commits, so the template version it started from is ambiguous. Run SM_TEMPLATE_BASE=<template commit> pnpm template:update with the template commit it last matched.`,
    );
  const tree = git.ok(["rev-parse", `${roots[0]}^{tree}`]);
  const match = git
    .ok(["log", "--format=%H %T", next])
    .split("\n")
    .find((line) => line.endsWith(` ${tree}`));
  if (!match)
    throw new Stop(
      [
        `This repository's first commit matches no version of ${source}, so it does not look like a copy made with "Use this template".`,
        "If it is one, find the template commit it last matched and run:",
        "  SM_TEMPLATE_BASE=<template commit> pnpm template:update",
      ].join("\n"),
    );
  return match.slice(0, 40);
}

const REASONS: Record<string, string> = {
  "1,2,3": "you and the template both changed it",
  "2,3": "you and the template both added it",
  "1,3": "you deleted it and the template changed it",
  "1,2": "the template deleted it and you changed it",
};

/** Conflicted paths in index order, each with what the two sides did. */
function unmergedPaths(git: Git): { path: string; reason: string }[] {
  const stages = new Map<string, string[]>();
  for (const entry of git.ok(["ls-files", "--unmerged", "-z"]).split("\0")) {
    const match = /^\d+ [0-9a-f]+ (\d)\t(.+)$/s.exec(entry);
    if (!match) continue;
    const [, stage = "", path = ""] = match;
    stages.set(path, [...(stages.get(path) ?? []), stage]);
  }
  return [...stages].map(([path, present]) => ({
    path,
    reason: REASONS[present.sort().join(",")] ?? "you and the template renamed or deleted it differently",
  }));
}

const LABELS: Record<string, string> = {
  A: "added",
  C: "copied",
  D: "deleted",
  M: "modified",
  R: "renamed",
  T: "changed type",
  U: "conflicted",
};

/** Staged changes against HEAD, with renames, as summary lines and the paths they touch. */
function stagedChanges(git: Git): { line: string; paths: string[] }[] {
  const tokens = git.run(["diff", "--cached", "--name-status", "-M", "-z"]).stdout.split("\0");
  const changes: { line: string; paths: string[] }[] = [];
  for (let index = 0; index < tokens.length; index++) {
    const status = tokens[index]?.[0];
    if (!status) continue;
    const label = LABELS[status] ?? status;
    if (status === "R" || status === "C") {
      const from = tokens[++index] ?? "";
      const to = tokens[++index] ?? "";
      changes.push({ line: `${label} ${from} -> ${to}`, paths: [from, to] });
    } else {
      const path = tokens[++index] ?? "";
      changes.push({ line: `${label} ${path}`, paths: [path] });
    }
  }
  return changes;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}
