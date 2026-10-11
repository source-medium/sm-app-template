import { spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";

/** Build metadata only. Application configuration still comes from runtime bindings. */
export function buildId(cwd = process.cwd(), env: Record<string, string | undefined> = process.env): string {
  const hosted = env.WORKERS_CI_COMMIT_SHA || env.VERCEL_GIT_COMMIT_SHA || env.GITHUB_SHA;
  if (hosted && !/^[a-f0-9]{40}$/i.test(hosted)) throw new Error("The host supplied an invalid build commit.");

  const git = (args: string[]) => spawnSync("git", args, { cwd, encoding: "utf8", windowsHide: true });
  const head = git(["rev-parse", "HEAD"]);
  const commit = head.status === 0 ? head.stdout.trim() : undefined;
  if (hosted && commit && hosted.toLowerCase() !== commit)
    throw new Error("The host's build commit does not match this checkout.");

  if (commit) {
    const status = git(["status", "--porcelain", "--untracked-files=normal"]);
    if (status.status !== 0) throw new Error("Could not verify whether the build checkout has uncommitted changes.");
    return `${commit.slice(0, 12)}${status.stdout.trim() ? "-dirty" : ""}`;
  }
  // Source archives can carry host metadata without .git. Unidentified local
  // builds must never look like a verified commit or collide through truncation.
  return hosted ? hosted.toLowerCase().slice(0, 12) : `local-${randomUUID()}`;
}
