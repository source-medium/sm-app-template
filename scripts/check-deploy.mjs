/** One artifact, every release check, and stage durations. Never skip a stage on a cache hit. */
import { spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const stages = ["check", "test:secrets", "test:browser", "smoke:worker"];
const started = Date.now();
const results = [];
for (const stage of stages) {
  const stageStarted = Date.now();
  console.log(`\nRelease stage: ${stage}`);
  const result = spawnSync("pnpm", [stage], { stdio: "inherit", shell: process.platform === "win32" });
  const seconds = Number(((Date.now() - stageStarted) / 1000).toFixed(1));
  const status = result.status ?? 1;
  results.push({ stage, seconds, status });
  console.log(`Release stage ${stage}: ${status === 0 ? "passed" : "failed"} (${seconds}s)`);
  if (status !== 0) {
    process.exitCode = status;
    break;
  }
}
mkdirSync(".sm", { recursive: true });
writeFileSync(
  ".sm/release-timings.json",
  JSON.stringify({ seconds: (Date.now() - started) / 1000, stages: results }, null, 2) + "\n",
);
console.log("Release durations: .sm/release-timings.json. These timings do not replace hosted verification.");
