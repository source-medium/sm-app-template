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

The formulas follow SourceMedium's metric catalog: net revenue is
`SUM(order_net_revenue)`, average order value is net revenue ÷ orders, MER is
net revenue ÷ ad spend, CPC is spend ÷ clicks, and platform ROAS is
platform-reported revenue ÷ spend.

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

Money columns (revenue, spend, costs) are NUMERIC and already in your
warehouse's reporting currency: SourceMedium's models convert orders before
they publish them. The app shows them as published:

- Decode with `bq.numeric()`; values stay exact decimal text.
- Add them with `sumDecimals` (`src/lib/data/decimal.ts`), never as JavaScript
  numbers. Ratios such as AOV use `decimalToNumber` and `ratio`.
- Format with `formatMoney`. Set `currency` in `app.config.ts` (for example
  `"USD"`) to show a currency symbol; with `null`, amounts show without one.
- Never add money across stores: stores can report in different currencies.

`obt_orders` also keeps each order's original amounts and currency
(`order_original_*`, `order_original_currency_code`) if you need them.

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

## Creative images

The Creatives view loads each ad's image straight from the URL in your
warehouse (`ad_creative_image_url`, else `ad_creative_thumbnail_url`), from any
https host, without a referrer. Ad platforms do not promise how long those
links last, so a card whose image fails shows the creative's text instead. To
allow only specific image hosts, narrow `img-src` in
`src/lib/security-headers.ts`.

## Speed and cost

Every page runs its queries in parallel with the store list when the URL names
a store, which the filter bar and navigation keep doing. Each BigQuery query
still takes a moment, so keep pages to a few queries each. `LIMIT` does not
reduce cost; filtering on a partition column and selecting fewer columns do.
