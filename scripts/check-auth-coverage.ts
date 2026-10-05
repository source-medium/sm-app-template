/** `pnpm check` step: fails when a data loader, route handler, or server action skips requireViewer(). */
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { findAuthGaps } from "./lib/auth-coverage";

const root = join(import.meta.dirname, "..");

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    return entry.isDirectory() ? walk(path) : /\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

const files = walk(join(root, "src")).map((path) => ({ path: relative(root, path), text: readFileSync(path, "utf8") }));
const gaps = findAuthGaps(files);
if (gaps.length > 0) {
  for (const gap of gaps) console.error(gap);
  process.exit(1);
}
console.log(
  `auth-coverage: every loader, route handler, and server action calls requireViewer() (${files.length} files).`,
);
