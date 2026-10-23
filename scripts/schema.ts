/**
 * pnpm schema <relation>: one relation's columns, types, keys, and
 * descriptions, never its rows. With live configuration it reads your
 * warehouse (types from BigQuery, descriptions from SourceMedium's data
 * dictionary); in managed development, through SourceMedium's data API (types
 * from the dataset's INFORMATION_SCHEMA); otherwise it prints the bundled
 * snapshot of SourceMedium's published relations.
 *
 *   pnpm schema obt_orders
 *   pnpm schema sm_metadata.dim_data_dictionary
 *   pnpm schema customized_views.my_table
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { parseConfig } from "../src/lib/config/env.server";
import { getTableMetadata, type BigQueryField } from "../src/lib/data/bigquery-rest.server";
import { readDictionary } from "../src/lib/data/catalog.server";
import { setLogEmitter } from "../src/lib/data/log";
import { queryStoreRoster } from "../src/lib/data/store-roster.server";
import { loadManagedContext } from "../src/lib/data/managed-api.server";
import { bigQueryClientFor, managedWarehouse, warehouseFor, type Warehouse } from "../src/lib/data/warehouse.server";
import { WarehouseError } from "../src/lib/data/warehouse-error";
import { loadLocalEnvironment, root } from "./lib/environment";

type Column = BigQueryField & { description?: string; key?: boolean; fields?: Column[] };
type Snapshot = { relations: Record<string, { dataset: string; description?: string; columns: Column[] }> };

/** The REST API's legacy type names, as GoogleSQL and the decoders in docs/data.md call them. */
const TYPE_NAMES: Record<string, string> = {
  INTEGER: "INT64",
  FLOAT: "FLOAT64",
  BOOLEAN: "BOOL",
  RECORD: "STRUCT",
};

function firstSentence(text: string): string {
  const sentence = /^.*?[.!?](\s|$)/.exec(text)?.[0]?.trim() ?? text;
  return sentence.length > 140 ? `${sentence.slice(0, 137)}…` : sentence;
}

function print(columns: readonly Column[], indent = "  "): void {
  for (const column of columns) {
    const type = `${TYPE_NAMES[column.type] ?? column.type}${column.mode === "REPEATED" ? "[]" : ""}${column.mode === "REQUIRED" ? " NOT NULL" : ""}`;
    console.log(`${indent}${column.name.padEnd(44)} ${type.padEnd(12)}${column.key ? " key" : ""}`);
    if (column.description) console.log(`${indent}    ${firstSentence(column.description)}`);
    if (column.fields) print(column.fields, `${indent}  `);
  }
}

function printRelation(title: string, description: string | undefined, columns: Column[]): void {
  console.log(title);
  if (description) console.log(`\n${description}\n`);
  console.log("Columns are nullable unless marked NOT NULL.");
  print(columns);
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
  setLogEmitter(() => undefined);
  const config = parseConfig(process.env);
  if (config.status === "ok" && config.mode === "managed") {
    console.error(
      "SM_HOSTING=managed runs only on SourceMedium's hosting. Use SM_HOSTING=managed-dev with a developer token (docs/managed.md).",
    );
    process.exit(1);
  }
  if (config.status === "ok" && config.mode === "managed-dev") {
    await printManagedRelation(managedWarehouse(config.managed, await loadManagedContext(config.managed)), {
      datasetArg,
      table,
    });
    return;
  }
  if (config.status === "ok" && config.mode === "live") {
    const live = config.live;
    const client = bigQueryClientFor(live);
    const datasets = datasetArg ? [datasetArg] : [live.transformedDatasetId, live.metadataDatasetId];
    for (const dataset of datasets) {
      let fields: BigQueryField[];
      let heading: string;
      try {
        const meta = await getTableMetadata(client, live.dataProjectId, dataset, table);
        fields = meta.fields;
        heading = `${live.dataProjectId}.${dataset}.${table} (${meta.type}, ${meta.location}), ${meta.fields.length} columns:`;
      } catch (error) {
        if (error instanceof WarehouseError && error.kind === "not_found") continue;
        if (error instanceof WarehouseError) {
          console.error(`${error.title}. ${error.remedy}`);
          process.exit(1);
        }
        throw error;
      }
      // Descriptions come from SourceMedium's data dictionary, which documents its own relations per store.
      const warehouse = warehouseFor(live);
      const documented = await queryStoreRoster(warehouse, config.storeId)
        .then(({ stores }) => (stores[0] ? readDictionary(warehouse, stores[0].sm_store_id, table) : []))
        .catch(() => []);
      const descriptions = new Map(
        documented.map((entry) => [entry.column_name, entry.column_description ?? undefined]),
      );
      printRelation(
        heading,
        documented.find((entry) => entry.table_description)?.table_description ?? undefined,
        fields.map((field) => ({ ...field, description: descriptions.get(field.name) })),
      );
      if (documented.length === 0)
        console.log("\n(No data dictionary entries for this relation; it may be your own table.)");
      return;
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
  printRelation(
    `${datasetArg ? `${datasetArg}.` : ""}${table}: snapshot of SourceMedium's published schema, ${entry.columns.length} columns.${datasetArg ? " The dataset is not checked without live configuration." : ""} Your warehouse may differ.`,
    entry.description,
    entry.columns,
  );
}

/** Columns from INFORMATION_SCHEMA through the data API: no Google metadata endpoint. */
async function printManagedRelation(
  warehouse: Warehouse,
  { datasetArg, table }: { datasetArg: string | null; table: string },
): Promise<void> {
  const datasets = datasetArg ? [datasetArg] : ["transformed", "metadata"];
  for (const dataset of datasets) {
    // table() resolves and validates the dataset; INFORMATION_SCHEMA.COLUMNS is a view inside it.
    const columnsView = warehouse.table("COLUMNS", dataset).replace(/\.COLUMNS`$/, ".INFORMATION_SCHEMA.COLUMNS`");
    const result = await warehouse.query({
      name: "schema-columns",
      sql: `SELECT column_name, data_type, is_nullable FROM ${columnsView} WHERE table_name = @table_name ORDER BY ordinal_position`,
      params: [{ name: "table_name", type: "STRING", value: table }],
      maxRows: 10_000,
    });
    if (result.rows.length === 0) continue;
    const fields: Column[] = result.rows.map((row) => ({
      name: String(row.column_name),
      type: String(row.data_type),
      ...(row.is_nullable === "NO" ? { mode: "REQUIRED" } : {}),
    }));
    const documented = await queryStoreRoster(warehouse, null)
      .then(({ stores }) => (stores[0] ? readDictionary(warehouse, stores[0].sm_store_id, table) : []))
      .catch(() => []);
    const descriptions = new Map(documented.map((entry) => [entry.column_name, entry.column_description ?? undefined]));
    printRelation(
      `${warehouse.table(table, dataset)}, ${fields.length} columns:`,
      documented.find((entry) => entry.table_description)?.table_description ?? undefined,
      fields.map((field) => ({ ...field, description: descriptions.get(field.name) })),
    );
    if (documented.length === 0)
      console.log("\n(No data dictionary entries for this relation; it may be your own table.)");
    return;
  }
  console.error(
    `No relation named ${table} in ${datasetArg ?? "the transformed or metadata dataset"}; check the name with the SourceMedium MCP or your data dictionary.`,
  );
  process.exit(1);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
