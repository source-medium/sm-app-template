# Working with your data

## See the warehouse before writing SQL

**SourceMedium MCP (recommended, development only).** The app never uses it at
runtime. Your agent signs in with your own SourceMedium login, so it sees what
you can see, and no app secret is involved.

- Claude Code: this repository's `.mcp.json` already points at
  `https://mcp.sourcemedium.com/mcp`. Run `/mcp`, pick **sourcemedium**, sign in.
- Codex: `codex mcp add sourcemedium --url https://mcp.sourcemedium.com/mcp`,
  then `codex mcp login sourcemedium`.
- Cursor: add `{"mcpServers": {"sourcemedium": {"url": "https://mcp.sourcemedium.com/mcp"}}}`
  to `~/.cursor/mcp.json`, then **Login** in Cursor's MCP settings.

Use `get_data_context` (your project and datasets), `search_data_catalog`,
`describe_table`, and `query_metrics`. Full guide:
https://sourcemedium.com/docs/ai-analyst/connect-an-ai-assistant

**`pnpm schema <relation>`** prints a relation's columns and types through the
app's own key (never rows). Without live configuration it prints a bundled
snapshot of SourceMedium's published schema, which may differ from yours.

## The example's relations

| View           | Relation                      | Grain                             | Columns used                                                                                                          |
| -------------- | ----------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Overview       | `rpt_executive_summary_daily` | store, channel, sub-channel, date | `order_count` (FLOAT64), `website_sessions`, `ad_clicks` (INT64)                                                      |
| Paid marketing | `rpt_ad_performance_daily`    | ad by day                         | `sm_channel`, `ad_campaign_id`, `ad_campaign_name`, `ad_impressions`, `ad_clicks`, `ad_platform_reported_conversions` |
| Creatives      | `rpt_ad_performance_daily`    | ad by day, aggregated to creative | `ad_creative_*` text and image URLs, the same measures                                                                |
| Orders         | `obt_orders`                  | one row per order                 | `sm_order_key`, `order_name`, `order_created_at`, channel, type, status, quantities                                   |

Every query filters one store with `sm_store_id = @store_id`. There are no
cross-store totals. The store picker lists the distinct `sm_store_id` values of
`rpt_executive_summary_daily` (at most 50); name them in `app.config.ts`.

## Writing a query

```ts
const { warehouse } = await requireViewer({ live: true });
const result = await warehouse.query({
  name: "top_products", // becomes the sm_query job label
  maxRows: 200,
  sql: `
    SELECT product_title, SUM(units) AS units
    FROM ${warehouse.table("your_relation")}
    WHERE sm_store_id = @store_id AND date BETWEEN @start_date AND @end_date
    GROUP BY product_title
    ORDER BY units DESC
    LIMIT @limit`,
  params: [
    { name: "store_id", type: "STRING", value: filters.storeId },
    { name: "start_date", type: "DATE", value: filters.range.from },
    { name: "end_date", type: "DATE", value: filters.range.to },
    { name: "limit", type: "INT64", value: 201 },
  ],
});
const rows = decodeRows(TopProductRow, result.rows, "your_relation");
```

- Browser input only ever becomes a parameter value, or picks a key from a
  fixed map in code (see `creatives/bigquery.ts`). Never concatenate it into SQL.
- `warehouse.table()` builds the fully qualified name from your configuration;
  pass `"metadata"` as the second argument for `sm_metadata` relations.
- Aggregate in SQL. `maxRows` bounds the rows returned across pages, and
  `result.truncated` says when more matched. Show truncation (the data table
  does), and never compute a total from a truncated list: throw
  `new WarehouseError("result_too_large")` instead.
- `LIMIT` bounds output, not cost: BigQuery bills the columns scanned. Each
  query also carries a byte ceiling (`BIGQUERY_MAX_BYTES_BILLED`, default 1 GiB).
- Each query has one 30-second deadline. A query that is still running is
  polled, never resubmitted; on a deadline the app asks BigQuery to cancel it.

## Decoding rows exactly

BigQuery returns every value as text. Decode with `bq.*` in a Zod schema:

| BigQuery  | Decoder          | In TypeScript                                 |
| --------- | ---------------- | --------------------------------------------- |
| INT64     | `bq.int64()`     | `bigint`, every digit kept                    |
| FLOAT64   | `bq.float64()`   | `number`, must be finite                      |
| NUMERIC   | `bq.numeric()`   | exact decimal string                          |
| DATE      | `bq.date()`      | `"2026-10-04"`, a calendar date, no time zone |
| TIMESTAMP | `bq.timestamp()` | `{ micros: bigint, iso: string }`             |
| BOOL      | `bq.bool()`      | `boolean`                                     |

Add `.nullable()` for nullable columns. A row that does not match names the
relation and column on screen, so a schema change is obvious. Format values on
the server with `src/lib/format.ts`; `toChartNumber` refuses to round a large
integer into a plausible-looking chart value.

## Money and currency

The example shows no revenue, spend, or other money yet. The report relations
carry money columns but no currency or time-zone column, and a store's record
in SourceMedium is not proof of the currency its reports use. Until the
reporting currency for a store is verified:

- do not add revenue, spend, AOV, ROAS, or order amounts to a view,
- never add a currency symbol you have not verified, and
- never add money across stores.

`obt_orders` does carry a per-order `order_currency_code`, which the Orders
drawer shows as a fact about each order.

## Freshness

Pages show **Queried at** and **Data freshness unknown**. The query time says
when the app asked, not how current the warehouse is. Do not use `MAX(date)` as
freshness: `rpt_executive_summary_daily` includes forward-dated target rows,
which is also why date ranges end no later than today.

## Metadata

`src/lib/data/catalog.server.ts` reads the published `dim_data_dictionary`
(documented columns of a relation, for one store) and
`dim_semantic_metric_catalog` (SourceMedium's metric definitions, which have no
store column). A metric's `calculation` is documentation, not runnable SQL.
Both are optional: a page can read any relation the app can reach.

## Check your numbers

Before trusting a new view, compare it with `query_metrics` in the SourceMedium
MCP for the same store and dates, or with a number someone has reviewed. For
deeper checks with your own BigQuery access, SourceMedium publishes the
[SM BigQuery Analyst skill (v1.1.0)](https://github.com/source-medium/skills/tree/v1.1.0/skills/sm-bigquery-analyst);
it uses your own `gcloud` login, not the app's key.

## Query cost on the demo warehouse

Dry runs of the example's queries against SourceMedium's demo warehouse
(2026-10-05, 28 days) estimated: overview 1.2 MiB, paid marketing 40 and 70 MiB,
creatives 104 MiB, an orders page 271 MiB, one order's details 546 MiB. The
demo's `obt_orders` is not partitioned, so its reads scan every order; a large
store can reach the 1 GiB ceiling. Narrow the selected columns or date range
if `pnpm diagnose` or a page reports "Query too large".
