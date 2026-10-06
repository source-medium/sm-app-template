/**
 * .agents/skills is canonical (Codex reads it); .claude/skills holds copies
 * for Claude Code. Copies, not symlinks, so the template survives Windows
 * checkouts, GitHub template copies, and zip downloads.
 */
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, sep } from "node:path";

/** Repository paths always use "/", so messages and comparisons match on Windows too. */
function toPosix(path: string): string {
  return path.split(sep).join("/");
}

function files(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}

/** One sentence per difference between the canonical skills and the copies. */
export function skillDifferences(root: string): string[] {
  const source = join(root, ".agents/skills");
  const target = join(root, ".claude/skills");
  const differences: string[] = [];
  const sourceFiles = new Set(files(source).map((path) => toPosix(relative(source, path))));
  for (const file of sourceFiles) {
    const copy = join(target, file);
    if (!existsSync(copy) || !readFileSync(copy).equals(readFileSync(join(source, file)))) {
      differences.push(
        `\`.claude/skills/${file}\` differs from \`.agents/skills/${file}\`; make the change in \`.agents/skills/${file}\` (sync overwrites the copy), then run \`pnpm skills:sync\`.`,
      );
    }
  }
  for (const file of files(target).map((path) => toPosix(relative(target, path)))) {
    if (!sourceFiles.has(file)) {
      differences.push(
        `\`.claude/skills/${file}\` has no source in .agents/skills; run \`pnpm skills:sync\` to remove it.`,
      );
    }
  }
  return differences;
}

export function syncSkills(root: string): number {
  const source = join(root, ".agents/skills");
  const target = join(root, ".claude/skills");
  rmSync(target, { recursive: true, force: true });
  const copied = files(source);
  for (const path of copied) {
    const destination = join(target, relative(source, path));
    mkdirSync(dirname(destination), { recursive: true });
    writeFileSync(destination, readFileSync(path));
  }
  return copied.length;
}
