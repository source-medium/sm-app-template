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

| View           | Relation                      | Grain                             | Columns used                                                                                                                                                      |
| -------------- | ----------------------------- | --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview       | `rpt_executive_summary_daily` | store, channel, sub-channel, date | `order_net_revenue`, `ad_spend` (NUMERIC), `order_count` (FLOAT64), `website_sessions`, `ad_clicks` (INT64)                                                       |
| Paid marketing | `rpt_ad_performance_daily`    | ad by day                         | `sm_channel`, `ad_campaign_id`, `ad_campaign_name`, `ad_spend`, `ad_impressions`, `ad_clicks`, `ad_platform_reported_conversions`, `ad_platform_reported_revenue` |
| Creatives      | `rpt_ad_performance_daily`    | ad by day, aggregated to creative | `ad_creative_*` text and image URLs, the same measures                                                                                                            |
| Orders         | `obt_orders`                  | one row per order                 | `sm_order_key`, `order_name`, `order_processed_at_local_datetime`, channel, type, status, quantities, and the order's revenue columns                             |

The example uses these formulas: net revenue is
`SUM(order_net_revenue)`, revenue per summary order is net revenue ÷ summary
orders, MER is
net revenue ÷ ad spend, CPC is spend ÷ clicks, and platform ROAS is
platform-reported revenue ÷ spend. Overview implements the all-channel sums
used by the catalog's Executive Summary metrics (`order_net_revenue_summary`, `order_count_summary`,
`total_ad_spend_summary`), which sum every `sm_channel` row; add an
`sm_channel` filter to report only some channels. This is an implementation
match, not an independent numerical reconciliation. Summary orders include
excluded, draft and exchanged channels when published and can differ from
valid orders in `obt_orders`. The UI labels that count and its revenue ratio
explicitly; do not present the ratio as valid-order AOV without reconciling the
definitions, dates and store. The demo discrepancy remains a release check in
[release readiness](release-readiness.md).

Every query filters one store with `sm_store_id = @store_id`. There are no
cross-store totals. The store picker lists the distinct `sm_store_id` values of
`rpt_executive_summary_daily` (at most 50); name them in `app.config.ts`.

Orders are listed by `order_processed_at_local_datetime`, the column
SourceMedium partitions `obt_orders` on, so a date range reads only the months
it covers. Filter large tables on their partition column whenever you can.

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
- `warehouse.table()` builds the fully qualified name from your configuration:
  `table("obt_orders")` for SourceMedium's transformed dataset,
  `table("dim_data_dictionary", "metadata")` for its metadata dataset, and
  `table("customized_views.my_table")` for any other dataset in your warehouse
  project that the app can read.
- Aggregate in SQL. `maxRows` bounds the rows returned across pages, and
  `result.truncated` says when more matched. Show truncation (the data table
  does), and never compute a total from a truncated list: throw
  `new WarehouseError("result_too_large")` instead. Independently, the client
  stops when cumulative response bodies exceed 10 MiB across submission, polls
  and retries, counting UTF-8 bytes as chunks arrive. Exceeding that limit
  throws instead of returning partial
  totals; reduce columns or aggregate more in SQL.
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

Money columns (revenue, spend, costs) are NUMERIC and already in your
warehouse's reporting currency: SourceMedium's models convert orders before
they publish them. The app shows them as published:

- Decode with `bq.numeric()`; values stay exact decimal text.
- Add them with `sumDecimals` (`src/lib/data/decimal.ts`), never as JavaScript
  numbers. Ratios such as revenue per summary order use `decimalToNumber` and `ratio`.
- Format with `formatMoney`. Set `currency` in `app.config.ts` (for example
  `"USD"`) to show a currency symbol; with `null`, amounts show without one.
- Never add money across stores: stores can report in different currencies.

`obt_orders` also keeps each order's original amounts and currency
(`order_original_*`, `order_original_currency_code`) if you need them.

## Refresh and freshness

**Refresh data** re-reads the current report with the filters already applied
in the URL. It keeps the report visible while loading and disables repeat clicks.
Unapplied filter edits are not submitted. Refreshing the app does not trigger
SourceMedium's ingestion pipeline. Reports do not poll or refresh automatically.

Each `DataRegion` shows **Queried at** only after its data loads successfully,
including an empty result. The time is when the section finished loading, not
when page rendering began. Errors get no success timestamp. Sample mode labels
the time **Sample loaded at**, since it runs no warehouse query.

Pages also show **Data freshness unknown**. The query time does not tell you
how current the warehouse is. Do not use `MAX(date)` as
freshness: `rpt_executive_summary_daily` includes forward-dated target rows,
which is also why date ranges end no later than today.

Showing a table's own snapshot time, labeled as such (for example "Inventory
snapshot as of …" from `inventory_snapshot_at`), is fine: it describes that
table, not how current the whole warehouse is.

There is no shared app or CDN cache of report data. Repeated auth and store-list
reads are deduplicated within one server render; credentials are reused until
shortly before expiry. BigQuery can serve eligible repeated queries from its
[native query cache](https://docs.cloud.google.com/bigquery/docs/cached-results).
Refresh does not bypass that cache. Browser Back/Forward can restore a previous
report; use **Refresh data** to re-read it.

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

## Creative images

The Creatives view loads each ad's image straight from the URL in your
warehouse (`ad_creative_image_url`, else `ad_creative_thumbnail_url`), from any
https host, without a referrer. Ad platforms do not promise how long those
links last, so a card whose image fails shows the creative's text instead. To
allow only specific image hosts, narrow `img-src` in
`src/lib/security-headers.ts`.

The image host sees the viewer's IP address, request time and complete image
URL, and may receive cookies permitted by the browser. `no-referrer` hides the
app's URL, not those details. Warehouse URLs may contain tracking identifiers;
opening Creatives can therefore reveal activity to an ad platform or another
image host. Use this behavior only when acceptable for your team. To prevent
external image requests, set `img-src` to `'self' data:`; remote cards then use
the existing text fallback. Never put app credentials in image URLs.

## Speed and cost

Every page runs its queries in parallel with the store list when the URL names
a store, which the filter bar and navigation keep doing. Each BigQuery query
still takes a moment (on the demo warehouse, pages took 1 to 2.5 seconds from
Cloudflare's edge), so keep pages to a few queries each. `LIMIT` does not
reduce cost; filtering on a partition column and selecting fewer columns do.

## Demo reconciliation

The demo warehouse applies privacy masking to numeric metrics. Summary order
counts are scaled, while the number of order rows is not. Consequently, demo
Summary orders need not match a count of valid order rows. Compare Overview
with the catalog's summary metrics, using the same store and dates and every
channel. Do not apply a demo-specific adjustment to customer queries.
