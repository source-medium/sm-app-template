import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { parseCsv, reconcile, Reference } from "./lib/reconciliation";

try {
  const [referenceFile, csvFile, ...extra] = process.argv.slice(2);
  if (!referenceFile || !csvFile || extra.length) throw new Error();
  const reference = Reference.parse(JSON.parse(readFileSync(referenceFile, "utf8")));
  const results = reconcile(reference, parseCsv(readFileSync(csvFile, "utf8")));
  mkdirSync(".sm", { recursive: true });
  writeFileSync(".sm/reconciliation-report.json", JSON.stringify({ reference, results }, null, 2) + "\n");
  for (const result of results) console.log(`${result.status.toUpperCase()} ${result.field}`);
  console.log(
    "Private detail: .sm/reconciliation-report.json. Matches confirm only the reviewed scope, definitions and tolerance; they do not establish freshness.",
  );
  if (results.some((result) => result.status !== "match")) process.exitCode = 1;
} catch {
  console.error(
    "Reconciliation could not run. Check the reference and an unmodified live CSV with matching scope. See docs/reconciliation.md. No input values were printed.",
  );
  process.exitCode = 1;
}
