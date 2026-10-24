import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { expect, it } from "vitest";
import provenance from "./assets/provenance.json";
it("ships licensed, versioned geometry with intact checksums and a bounded map-only payload", () => {
  let bytes = 0;
  for (const asset of provenance) {
    const data = readFileSync(new URL(`./assets/${asset.asset}`, import.meta.url));
    expect(createHash("sha256").update(data).digest("hex")).toBe(asset.asset_sha256);
    expect(asset.version).toBe("5.1.1");
    expect(asset.license).toBe("Public domain");
    const geometry = JSON.parse(data.toString());
    expect(Object.keys(geometry.paths)).toHaveLength(asset.codes);
    bytes += gzipSync(data, { level: 9 }).byteLength;
  }
  expect(bytes).toBeLessThan(200 * 1024);
  const shapes = readFileSync(new URL("./map-shapes.tsx", import.meta.url), "utf8");
  expect(shapes).toContain('await import("./assets/countries.json")');
  expect(shapes).toContain('await import("./assets/us-states.json")');
});
