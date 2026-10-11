import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { buildId } from "../../scripts/lib/build-id";

const directories: string[] = [];
afterEach(() => directories.splice(0).forEach((dir) => rmSync(dir, { recursive: true, force: true })));
function directory() {
  const dir = mkdtempSync(join(tmpdir(), "sm-build-id-"));
  directories.push(dir);
  return dir;
}
function checkout() {
  const dir = directory();
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: dir, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  git("init");
  writeFileSync(join(dir, "source.txt"), "reviewed source\n");
  writeFileSync(join(dir, ".gitignore"), "ignored.txt\n");
  git("add", ".");
  git(
    "-c",
    "user.name=Test",
    "-c",
    "user.email=test@example.invalid",
    "-c",
    "commit.gpgsign=false",
    "-c",
    "core.hooksPath=" + join(dir, "no-hooks"),
    "commit",
    "-m",
    "Initial source",
  );
  return { dir, git, commit: git("rev-parse", "HEAD") };
}

it("identifies clean manual and hosted builds with the same commit", () => {
  const { dir, commit } = checkout();
  writeFileSync(join(dir, "ignored.txt"), "local build output");
  expect(buildId(dir, {})).toBe(commit.slice(0, 12));
  expect(buildId(dir, { WORKERS_CI_COMMIT_SHA: commit })).toBe(commit.slice(0, 12));
});

it.each(["modified", "staged", "untracked"])("does not certify %s source as a reviewed commit", (state) => {
  const { dir, git, commit } = checkout();
  writeFileSync(join(dir, state === "untracked" ? "new.ts" : "source.txt"), "unreviewed change");
  if (state === "staged") git("add", ".");
  expect(buildId(dir, {})).toBe(`${commit.slice(0, 12)}-dirty`);
  expect(buildId(dir, { WORKERS_CI_COMMIT_SHA: commit })).toBe(`${commit.slice(0, 12)}-dirty`);
});

it("rejects stale or malformed host metadata", () => {
  const { dir } = checkout();
  expect(() => buildId(dir, { WORKERS_CI_COMMIT_SHA: "a".repeat(40) })).toThrow("does not match");
  expect(() => buildId(dir, { WORKERS_CI_COMMIT_SHA: "not-a-commit" })).toThrow("invalid build commit");
});

it.each(["WORKERS_CI_COMMIT_SHA", "VERCEL_GIT_COMMIT_SHA", "GITHUB_SHA"])("supports %s in source archives", (name) => {
  expect(buildId(directory(), { [name]: "a".repeat(40) })).toBe("a".repeat(12));
});

it("gives unidentified archives distinct local IDs without truncating them", () => {
  const dir = directory();
  const first = buildId(dir, {});
  expect(first).toMatch(/^local-[a-f0-9-]{36}$/);
  expect(buildId(dir, {})).not.toBe(first);
});
