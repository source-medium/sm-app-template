import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

/**
 * The public demo's media (contract demo-media-v1). DemoCo's warehouse rows
 * name these public/ files by URL on its hosted app, which runs this
 * template's main; reporting_queries copies the manifest and keeps its masking
 * to exactly these files. A file renamed, removed or replaced here without the
 * manifest would show the demo a broken image or the wrong one.
 */
it("ships every public demo file the demo-media contract lists, byte for byte", () => {
  const manifest = JSON.parse(readFileSync("contracts/demo-media-v1/media.json", "utf8")) as {
    contract: string;
    version: number;
    files: Record<string, string>;
  };
  expect([manifest.contract, manifest.version]).toEqual(["demo-media-v1", 1]);
  const paths = Object.keys(manifest.files);
  expect(paths).toEqual([...paths].sort());
  const shipped = Object.fromEntries(
    paths.map((path) => [
      path,
      createHash("sha256")
        .update(readFileSync(`public/${path}`))
        .digest("hex"),
    ]),
  );
  expect(shipped).toEqual(manifest.files);
});
