---
name: sm-data
description: Use when reading SourceMedium warehouse data in this app - finding a table or column, writing or changing SQL in a src/features/*/bigquery.ts file, decoding rows, or checking that a number is right.
---

Follow `docs/data.md` in this repository. In order:

1. Discover the relation and its columns with the SourceMedium MCP
   (`get_data_context`, `search_data_catalog`, `describe_table`) or
   `pnpm schema <relation>`. Never guess a name. Without local live configuration,
   this command uses the bundled snapshot, not the customer warehouse. In a
   cloud agent, follow `docs/cloud.md#debug-with-live-data` for an optional
   Development credential entered privately in environment settings. Run schema
   checks yourself without inspecting the key. Otherwise use separately
   authorized MCP or schema-only output; never request the production credential.
2. Write parameterized SQL in the feature's `bigquery.ts`, starting with
   `await requireViewer({ live: true, storeId: filters.storeId })` (AGENTS.md, rule 1).
   Keep `sm_store_id = @store_id` on every data source read; see `docs/data.md#store-scope`.
3. Decode with a Zod row schema in `rows.ts` built from `bq.*` decoders.
4. Validate the result against the MCP's `query_metrics`, or a number
   someone has reviewed, before building charts on it.

Then run `pnpm check`.
