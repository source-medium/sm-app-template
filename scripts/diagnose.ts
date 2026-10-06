/**
 * pnpm diagnose (the doctor): checks configuration and, with a complete live
 * configuration,
 * the warehouse. Prints one status line naming the mode and guard, never a
 * credential. Sample mode makes no Google call. `--offline` (used by
 * `pnpm dev`) stops after the configuration check.
 */
import { execFileSync } from "node:child_process";
import { describeConfig, parseConfig, type LiveConfig } from "../src/lib/config/env.server";
import { dryRunQuery, getDatasetMetadata, getTableMetadata } from "../src/lib/data/bigquery-rest.server";
import { readDictionary, readMetricCatalog } from "../src/lib/data/catalog.server";
import { queryStoreRoster, ROSTER_RELATION, storeRosterQuery } from "../src/lib/data/store-roster.server";
import { bigQueryClientFor, warehouseFor } from "../src/lib/data/warehouse.server";
import { WarehouseError } from "../src/lib/data/warehouse-error";
import { setLogEmitter } from "../src/lib/data/log";
import { loadLocalEnvironment, root } from "./lib/environment";

const offline = process.argv.includes("--offline");
/** The store roster's and the Overview query's columns. */
const REQUIRED_COLUMNS = [
  "sm_store_id",
  "date",
  "order_net_revenue",
  "order_count",
  "website_sessions",
  "ad_clicks",
  "ad_spend",
];

const ok = (message: string) => console.log(`  ✓ ${message}`);
const fail = (message: string) => console.error(`  ✗ ${message}`);

function trackedEnvFiles(): string[] | null {
  try {
    const output = execFileSync("git", ["ls-files", "-z", "--", ".env*", ".dev.vars*"], {
      cwd: root,
      encoding: "utf8",
    });
    return output.split("\0").filter((file) => file && file !== ".env.example");
  } catch {
    return null;
  }
}

function mib(bytes: bigint): string {
  return `${(Number(bytes) / 1024 / 1024).toFixed(1)} MiB`;
}

async function checkWarehouse(live: LiveConfig): Promise<boolean> {
  setLogEmitter(() => undefined);
  const client = bigQueryClientFor(live);
  const warehouse = warehouseFor(live);
  const step = async <T>(run: () => Promise<T>, describe: (value: T) => string): Promise<T | null> => {
    try {
      const value = await run();
      ok(describe(value));
      return value;
    } catch (error) {
      if (!(error instanceof WarehouseError)) throw error;
      fail(`${error.title}. ${error.remedy}${error.detail ? ` (${error.detail})` : ""}`);
      return null;
    }
  };

  ok(`Key for ${live.key.clientEmail}`);
  const token = await step(
    () => client.getAccessToken(AbortSignal.timeout(15_000)),
    () => "Google accepted the key",
  );
  if (token === null) return false;

  let healthy = true;
  for (const datasetId of [live.transformedDatasetId, live.metadataDatasetId]) {
    const dataset = await step(
      () => getDatasetMetadata(client, live.dataProjectId, datasetId),
      (meta) => `Dataset ${live.dataProjectId}.${datasetId} is readable (${meta.location})`,
    );
    if (!dataset) {
      healthy = false;
    } else if (dataset.location.toLowerCase() !== live.location.toLowerCase()) {
      fail(
        `Dataset ${datasetId} is in ${dataset.location} but BIGQUERY_LOCATION is ${live.location}; recopy the configuration block from Apps.`,
      );
      healthy = false;
    }
  }
  if (!healthy) return false;

  const table = await step(
    () => getTableMetadata(client, live.dataProjectId, live.transformedDatasetId, ROSTER_RELATION),
    (meta) => `${ROSTER_RELATION} is readable (${meta.fields.length} columns)`,
  );
  if (!table) return false;
  const missing = REQUIRED_COLUMNS.filter((name) => !table.fields.some((field) => field.name === name));
  if (missing.length > 0) {
    fail(
      `${ROSTER_RELATION} is missing ${missing.join(", ")}; the example views need them (run \`pnpm schema ${ROSTER_RELATION}\`).`,
    );
    return false;
  }

  const example = storeRosterQuery(warehouse);
  const dry = await step(
    () => dryRunQuery(client, example),
    ({ bytesProcessed }) => `Example query would scan ${mib(bytesProcessed)} (ceiling ${mib(live.maxBytesBilled)})`,
  );
  if (!dry) return false;
  if (dry.bytesProcessed > live.maxBytesBilled) {
    fail(
      "The example query would scan more than BIGQUERY_MAX_BYTES_BILLED; the views will refuse to run. Raise the ceiling deliberately or contact SourceMedium.",
    );
    return false;
  }

  const stores = await step(
    () => queryStoreRoster(warehouse),
    (ids) => `Example query ran: ${ids.length} store${ids.length === 1 ? "" : "s"} with data`,
  );
  if (!stores) return false;
  const [firstStore] = stores;
  if (!firstStore) {
    fail(`${ROSTER_RELATION} has no stores yet; the views will show "No data" until SourceMedium publishes rows.`);
    return false;
  }

  const dictionary = await step(
    () => readDictionary(warehouse, firstStore, ROSTER_RELATION),
    (rows) => `Data dictionary readable for one store (${rows.length} documented columns of ${ROSTER_RELATION})`,
  );
  const catalog = await step(
    () => readMetricCatalog(warehouse, 50),
    (rows) => `Metric catalog readable (${rows.length} metrics sampled)`,
  );
  return dictionary !== null && catalog !== null;
}

async function main(): Promise<void> {
  loadLocalEnvironment();
  const config = parseConfig(process.env);
  console.log(`SourceMedium app: ${describeConfig(config)}`);

  const tracked = trackedEnvFiles();
  if (tracked && tracked.length > 0) {
    fail(
      `${tracked.join(", ")} ${tracked.length === 1 ? "is" : "are"} tracked by git; remove with \`git rm --cached <file>\` and rotate any secret it held.`,
    );
    process.exit(1);
  }

  if (config.status === "error") {
    for (const problem of config.problems) fail(problem.message);
    console.error(
      "Fix .env.local (or your host's runtime variables), then run `pnpm diagnose` again. See docs/connect.md.",
    );
    process.exit(1);
  }
  if (offline) return;

  if (tracked) ok("No secrets tracked in git");
  if (config.mode === "sample") {
    ok(
      "Sample mode makes no warehouse calls. To go live, paste your configuration block into .env.local (docs/connect.md).",
    );
    return;
  }
  const healthy = await checkWarehouse(config.live);
  console.log(healthy ? "All checks passed." : "Some checks failed; see docs/operations.md for remedies.");
  if (!healthy) process.exit(1);
}

await main();
