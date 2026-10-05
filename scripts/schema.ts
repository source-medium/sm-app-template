/**
 * pnpm schema <relation>: one relation's columns and types, never its rows.
 * Reads your warehouse with live configuration; otherwise prints the bundled
 * snapshot of SourceMedium's published relations.
 *
 *   pnpm schema obt_orders
 *   pnpm schema sm_metadata.dim_data_dictionary
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig } from "../src/lib/config/env.server";
import { getTableMetadata, type BigQueryField } from "../src/lib/data/bigquery-rest.server";
import { bigQueryClientFor } from "../src/lib/data/warehouse.server";
import { WarehouseError } from "../src/lib/data/warehouse-error";
import { loadLocalEnvironment, root } from "./lib/environment";

type Snapshot = { relations: Record<string, { dataset: string; columns: BigQueryField[] }> };

function print(fields: readonly BigQueryField[], indent = "  "): void {
  for (const field of fields) {
    const repeated = field.mode === "REPEATED" ? "[]" : "";
    const required = field.mode === "REQUIRED" ? " NOT NULL" : "";
    console.log(`${indent}${field.name.padEnd(48)} ${field.type}${repeated}${required}`);
    if (field.fields) print(field.fields, `${indent}  `);
  }
}

async function main(): Promise<void> {
  const argument = process.argv[2];
  if (!argument || !/^([A-Za-z0-9_]+\.)?[A-Za-z0-9_]+$/.test(argument)) {
    console.error(
      "Usage: pnpm schema <relation>, for example `pnpm schema obt_orders` or `pnpm schema sm_metadata.dim_data_dictionary`.",
    );
    process.exit(1);
  }
  const [datasetArg, table] = argument.includes(".") ? (argument.split(".") as [string, string]) : [null, argument];

  loadLocalEnvironment();
  const config = parseConfig(process.env);
  if (config.status === "ok" && config.mode === "live") {
    const live = config.live;
    const client = bigQueryClientFor(live);
    const datasets = datasetArg ? [datasetArg] : [live.transformedDatasetId, live.metadataDatasetId];
    for (const dataset of datasets) {
      try {
        const meta = await getTableMetadata(client, live.dataProjectId, dataset, table);
        console.log(
          `${live.dataProjectId}.${dataset}.${table} (${meta.type}, ${meta.location}), ${meta.fields.length} columns:`,
        );
        print(meta.fields);
        return;
      } catch (error) {
        if (error instanceof WarehouseError && error.kind === "not_found") continue;
        if (error instanceof WarehouseError) {
          console.error(`${error.title}. ${error.remedy}`);
          process.exit(1);
        }
        throw error;
      }
    }
    console.error(
      `No relation named ${table} in ${datasets.join(" or ")}; check the name with the SourceMedium MCP or your data dictionary.`,
    );
    process.exit(1);
  }

  const snapshot = JSON.parse(readFileSync(join(root, "scripts/schema-snapshot.json"), "utf8")) as Snapshot;
  const entry = snapshot.relations[table];
  if (!entry) {
    console.error(
      `${config.status === "error" ? "Configuration is invalid (run `pnpm diagnose`), so" : "Without live configuration,"} only the bundled snapshot is available, and it has no ${table}: ${Object.keys(snapshot.relations).join(", ")}.`,
    );
    process.exit(1);
  }
  console.log(
    `${table} (snapshot of SourceMedium's published schema; your warehouse may differ), ${entry.columns.length} columns:`,
  );
  print(entry.columns);
}

await main();
