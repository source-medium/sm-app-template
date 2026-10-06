/** Exercise the host replay branch in every installed Next DOM bundle. Updating
 * react-dom alone does not update these copies. Keep this regression when the
 * backport is replaced by an upstream release. */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

const bundles = ["react-dom", "react-dom-experimental"].flatMap((variant) => {
  const dir = join("node_modules/next/dist/compiled", variant, "cjs");
  return readdirSync(dir).flatMap((name) => {
    if (!name.endsWith(".js")) return [];
    const text = readFileSync(join(dir, name), "utf8");
    const start = text.indexOf("function replaySuspendedUnitOfWork(");
    if (start < 0) return [];
    const branch = text.slice(start).match(/case 5:\s*([\s\S]*?)\s*default:/)?.[1];
    if (!branch) throw new Error(`Cannot inspect hydration replay in ${variant}/${name}`);
    return [{ name: `${variant}/${name}`, branch }];
  });
});

describe("Next's bundled hydration replay", () => {
  it("includes stable, experimental, client and profiling copies", () => {
    for (const variant of ["react-dom", "react-dom-experimental"]) {
      for (const name of [
        "react-dom-client.production.js",
        "react-dom-client.development.js",
        "react-dom-profiling.profiling.js",
        "react-dom-profiling.development.js",
      ]) {
        expect(bundles.map((bundle) => bundle.name)).toContain(`${variant}/${name}`);
      }
    }
  });

  for (const bundle of bundles) {
    it.each(["claimed", "inserted", "unrelated"])(`${bundle.name}: restores %s hydration state`, (scenario) => {
      const parent = {};
      const fiber = { stateNode: {}, return: parent };
      const previousInstance = {};
      const context = {
        next: fiber,
        unitOfWork: fiber,
        hydrationParentFiber: scenario === "unrelated" ? parent : fiber,
        nextHydratableInstance: previousInstance,
        isHydrating: scenario !== "inserted",
        resetHooksOnUnwind: () => undefined,
        popToNextHostParent: () => {
          context.hydrationParentFiber = parent;
        },
      };
      runInNewContext(bundle.branch, context, { timeout: 1000 });
      expect(context.hydrationParentFiber).toBe(parent);
      expect(context.isHydrating).toBe(true);
      expect(context.nextHydratableInstance).toBe(scenario === "claimed" ? fiber.stateNode : previousInstance);
    });
  }
});
