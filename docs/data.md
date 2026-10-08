# Working with your data

## See the warehouse before writing SQL

**SourceMedium MCP (optional, development only).** The app never uses it at
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
Codex Cloud and Claude Code Cloud can use a separate [Development app
credential](cloud.md#debug-with-live-data) in environment settings to run this
command against your warehouse. MCP is not required for that path.

## The example's relations

| View           | Relation                                                              | Grain                                                               | Columns used                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview       | `rpt_executive_summary_daily`                                         | store, channel, sub-channel, date                                   | `order_net_revenue`, `ad_spend` (NUMERIC), `order_count` (FLOAT64), `website_sessions`, `ad_clicks` (INT64)                                                            |
| Paid marketing | `rpt_ad_performance_daily`                                            | ad by day                                                           | `sm_channel`, `ad_campaign_id`, `ad_campaign_name`, `ad_spend`, `ad_impressions`, `ad_clicks`, `ad_platform_reported_conversions`, `ad_platform_reported_revenue`      |
| Creatives      | `rpt_ad_performance_daily`                                            | ad by day, aggregated to creative                                   | `ad_creative_*` text and image URLs, the same measures                                                                                                                 |
| Orders         | `obt_orders`                                                          | one row per order                                                   | `sm_order_key`, `order_name`, `order_processed_at_local_datetime`, channel, type, status, quantities, and the order's revenue columns                                  |
| Products       | `obt_order_lines`                                                     | one row per order line, aggregated to product or variant            | `source_system`, product/variant ids and titles, `is_order_sm_valid`, `order_line_net_revenue`, `order_line_net_quantity`, `order_line_product_gross_profit` (NUMERIC) |
| Retention      | `rpt_cohort_ltv_by_first_valid_purchase_attribute_no_product_filters` | channel, acquisition cohort month, month age, one unsegmented slice | `cohort_size`, `customer_count`, `cumulative_order_net_revenue`, `cumulative_order_gross_profit`                                                                       |

The example uses these formulas: net revenue is
`SUM(order_net_revenue)`, revenue per summary order is net revenue ÷ summary
orders, MER is
net revenue ÷ ad spend, CPC is spend ÷ clicks, and platform ROAS is
platform-reported revenue ÷ spend. Overview implements the all-channel sums
used by the catalog's Executive Summary metrics (`order_net_revenue_summary`, `order_count_summary`,
`total_ad_spend_summary`), which sum every `sm_channel` row. **Sales channel** defaults to **All sales channels**;
select one to apply the same scope to KPIs, trends, comparisons, summaries and CSV.
The options are queried for the selected store and dates. The Looker template may
open on `online_dtc`, so match its channel before comparing numbers. This is an implementation
match, not an independent numerical reconciliation. Summary orders include
excluded, draft and exchanged channels when published and can differ from
valid orders in `obt_orders`. The UI labels that count and its revenue ratio
explicitly; do not present the ratio as valid-order AOV without reconciling the
definitions, dates and store. The demo discrepancy remains a release check in
[release readiness](release-readiness.md).

## Store scope

Every data query filters one store with `sm_store_id = @store_id`. There are no
cross-store totals. The store picker reads `dim_stores`: one row per active
store, with `sm_store_id`, `store_name`, and `brand_name`. It groups stores by
brand, uses their names automatically, and appends the ID when names repeat.
The selected value and shareable URL remain `?store=<sm_store_id>`, so renaming
a store does not break links. `app.config.ts` `storeLabels` is an optional
name override, not a required setup step. The roster is bounded to 50 stores;
overflow or duplicate IDs is an error rather than an incomplete picker.

Some warehouses have not received `dim_stores` yet. Only when the table is
missing does the app use distinct IDs from `rpt_executive_summary_daily`, with
optional configured labels. `pnpm diagnose` reports this fallback. An empty
dimension stays empty; permission and schema errors remain errors. Metadata
describes active stores, including those without report rows yet. It is not
an authorization policy: every viewer can access the deployment's allowed
store scope, and historical IDs may still have report data.

Set runtime `APP_STORE_ID` to restrict one deployment to that store. The roster
query is filtered in SQL, so unrelated stores neither appear nor consume its
50-store limit. Empty or unset preserves the multi-store app.

Store data functions start with `await requireViewer({ storeId: filters.storeId })`;
live functions use `{ live: true, storeId: filters.storeId }`. For a function
receiving the id directly, use `{ storeId }`. This also protects sample reads.
The scoped warehouse additionally refuses queries without exactly one matching
STRING `store_id` parameter before making a network call. Keep the corresponding
`sm_store_id = @store_id` SQL predicate on every source read; the guard checks
the parameter, not arbitrary SQL semantics. Review joins and subqueries when
extending the app. Store-free custom data needs a deliberate authorization
design before exposing it from a restricted deployment.

Orders are listed by `order_processed_at_local_datetime`, the column
SourceMedium partitions `obt_orders` on, so a date range reads only the months
it covers. Filter large tables on their partition column whenever you can.

## Writing a query

```ts
const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
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

`dim_stores.store_currency_code` is the currency configured for the store,
not a reporting-currency guarantee for the report measures. Do not use it to
automatically label combined revenue or spend. Its `store_timezone` describes
store configuration, not every source's date convention (Amazon order local
times use America/Los_Angeles). Neither field changes report calculations or
date presets. The bundled schema documents all seven metadata fields; the
picker reads only the identity, name, and brand it needs. Websites and logos
are not fetched by the picker.

Use one SourceMedium workspace reporting currency throughout the app. Keep
conversion in SourceMedium or the warehouse, and read the standard published
fields (`order_net_revenue`, `ad_spend`, and related measures). Set `currency`
in `app.config.ts` to the verified ISO code, for example `"USD"`; every view
uses it through `formatMoney`, and the report footer identifies it. This
setting formats amounts; it does not convert them. `null` leaves amounts
unlabeled and is not a currency check.

Confirm alignment when connecting data. SourceMedium converts supported
order money when reporting-currency conversion is enabled. Google Ads, Meta,
TikTok, AppLovin, and Snapchat also use reporting currency when enabled.
Amazon Ads uses the store currency, which may differ; other advertising
sources may retain account currency. One store's combined spend and MER can
therefore mix currencies. Resolve mismatches upstream before using these
totals; never relabel a source-currency amount as reporting currency.
See SourceMedium's [reporting currency rules](https://sourcemedium.com/docs/help-center/core-concepts/data-definitions/reporting-currency).

- Inspect each column's type. Order revenue and ad spend are NUMERIC: decode
  with `bq.numeric()` and keep exact decimal text. Platform-reported revenue
  is FLOAT64: decode with `bq.float64()`; it is approximate at the source.
- Add NUMERIC values with `sumDecimals` (`src/lib/data/decimal.ts`), never as
  JavaScript numbers. Ratios use `decimalToNumber` and `ratio`.
- Never add money across stores. The one configured currency must match every
  store exposed by this app; use separately scoped apps if they differ.

For order reconciliation, inspect `order_original_currency_code`,
`order_converted_currency_code`, `is_order_currency_canonicalized`, and
`order_original_*` / `order_converted_*` amounts. `order_currency_code` remains
the source transaction currency; do not use it to label converted revenue.
The summary and advertising report tables do not expose a common currency
code, so the app cannot infer their reporting currency from an order row.
Discounts and refunds are normally signed negative amounts; read published
net revenue rather than subtracting those signed amounts again.

## Period comparisons

Date presets include Yesterday, Last 7/28/90 days, Last full week
(Monday–Sunday), Last month, and Month to date through yesterday. They use
UTC calendar dates, like the picker defaults. Month to date is omitted on
the first of the month, when it has no completed days. Presets longer than
the configured maximum range are omitted rather than silently shortened.

Overview defaults to **Previous period**: the same number of calendar days,
immediately before the selected range. **Same dates last year** shifts the
calendar dates back one year, clamping Feb 29 to Feb 28 when needed. It does
not match weekdays; leap years can change the day count. Both ranges are visible; expand the comparison period for day counts and alignment notes. **Off** skips the comparison query.

The setting lives in `?compare=previous|year|off`, survives filters and report
links, and travels with navigation. Only views that implement comparisons
show the control. Overview daily charts overlay the comparison as a dashed line,
with the actual comparison date in the tooltip and table. Previous-period days
align by position; yearly days align by month and day. Unmatched leap days stay
gaps. Period totals still include every date in the displayed comparison range. Missing days stay missing, never zero. Days with rows do not
prove complete data, and a range including today may be incomplete.

To add comparisons to a view, opt into `ReportPage comparisons`, use its
`comparison.range`, and query each period with the same store and dimension
filters. Copy Overview's `getOverviewReport`: it reuses the existing bounded
query for each period in parallel, checks truncation, and keeps current data
visible if the comparison query fails. This adds one query when enabled.
Ratios are recomputed from each period's totals, not averaged from daily ratios.

`lib/comparison.ts` owns date rules and arithmetic; `patterns/kpi-delta.ts`
owns server-formatted KPI changes. Absolute money/count changes stay exact.
Percentages are `(current - baseline) / baseline`, displayed to two decimals.
Zero, negative, and missing baselines have explicit states instead of a
misleading percentage. Unchanged values are neutral. The default color is
neutral; a feature must explicitly choose whether higher or lower is better.
Overview uses higher-is-better only for net revenue and MER. Percentage-valued
metrics should label absolute changes as percentage points, distinct from
relative percent changes. Custom ranges, targets and weekday-aligned calendars
are intentionally left for apps that need them.

## Summary tables and ranked breakdowns

Overview's **Business summary** offers Daily, Weekly and Monthly rows via
`?grain=day|week|month`. Weeks begin Monday. SQL aggregates each bucket using
only the selected dates; edge buckets show their actual partial date range.
Daily charts stay daily. The footer always shows the full selected-period SQL
totals, independent of table pagination. MER divides the summed revenue by
summed spend. Missing days are not filled with zeros.

**Download CSV** exports the same applied store, dates, `sales_channel`, and
grain, with exact raw amounts. `row_type=period` rows are followed by one
`row_type=total` row. Filter on row type before summing the file to avoid double
counting. The download re-runs one bounded Overview query and fails on truncation.

Paid marketing's **Spend breakdown** ranks channels or campaigns with
`?breakdown=channel|campaign`. It adds one bounded SQL query that reads the
selected and comparison periods with identical store/channel filters. Comparison
Off excludes baseline rows. Shares use full-query spend before the top-10 limit;
the caption identifies top-10 results. Zero totals and negative spend suppress
shares; absent baseline values stay absent, not zero. The comparison control
applies to this breakdown; the existing delivery chart and campaign table show
the selected period.

Reuse `RankedBreakdown` for another dimension: the feature owns SQL ranking,
totals, shares and changes; the component owns the horizontal chart and table.
`ChartCard` supports dashed comparison series and horizontal bars, and
`DataTable` accepts server-computed totals. Keep allowed SQL dimensions and
calendar expressions in fixed maps. Do not build a general query builder.

## Applying report filters

Every control belongs to one GET form. A choice (store, comparison, and every
`SelectFilter`) submits the form as soon as it changes, so drafts in the other
fields travel with it and an invalid date range still blocks with its message.
Typed inputs (dates, search) are drafts until **Apply** (or **Search**) submits
them; without JavaScript, `SelectFilter` shows its own Apply. Date preset links
use the already applied filters. **More dates** holds the less frequent presets.
Invalid or overlong date URLs show a correction message and no report until a
valid range is applied.

`FilterBar` owns the `report-filters` GET form. `SelectFilter` and the other
feature inputs associate with it using `REPORT_FILTER_FORM_ID`, including when
rendered outside it or streamed later. Do not add a separate filter form or
hidden copies of those fields. Each control contributes its current value;
navigation and downloads use applied URL values. Filter-option loaders use
`DataRegion timestamp={false}` because their load time is not the report's
query time.

## Channel filters

Every example exposes `sm_channel` in its own report context. Overview, Products,
and Orders use **Sales channel** (`?sales_channel=`); Paid marketing and Creatives
use the advertising report's channels (`?channel=`). Retention selects one
**Acquisition sales channel** from its published cohort report. Advertising
channels and sales channels are different domains; navigation does not silently
carry a channel into another view.

The default is all channels except Retention, which keeps acquisition channels
separate. Options come from the selected store and date range, before top-N
limits, pagination or search. Missing warehouse channels appear as `(none)`.
Unknown URL choices remain visible with an empty result and can be reset.
Filters use typed SQL parameters and affect Products' comparison period, ranking,
shares and totals together. Orders keeps the channel through search and paging;
changing it resets the cursor and closes the selected order. Creatives groups
by both channel and creative id so equal platform ids cannot merge.

`ChannelFilter` owns consistent picker behavior; each feature owns its roster
query and data predicates. No shared code imports an example feature.

## Products and purchase cohorts

**Products** groups valid-order lines by product or variant, with source-system
identity in the key so repeated titles and platform ids do not merge. Unassigned
product lines remain a named group. Net revenue, net units and product gross
profit are summed in SQL for the selected sales channel (or all channels) in one store. Product gross
profit is net revenue minus product cost, not profit after shipping, fulfillment
or payment fees. Refund quantities reduce net units. Amounts use the canonical
reporting-currency fields, not `original_*` amounts.

One query covers both selected and comparison periods, with identical validity
store and sales-channel predicates. Ranking uses a fixed measure map; full-period totals and
the share denominator are calculated before the top-10 limit. Negative members
or a zero total suppress shares. Missing comparisons stay missing. The date
predicate uses `order_processed_at_local_datetime` directly for partition pruning.

**Retention** uses `?as_of=YYYY-MM&channel=online_dtc&measure=retention|revenue|profit`.
The cutoff defaults to the last completed UTC calendar month and is frozen in
shared links. It shows twelve acquisition months through that cutoff, at ages
0–11. Month 0 means the acquisition calendar month, not a fixed 30-day window.
Ordinary `from`/`to` filters do not define this report's observation window.

The query selects exactly `acquisition_order_filter_dimension = 'no_filters'`
and `sm_order_line_type = 'all_orders'`. Other acquisition dimensions overlap
and must not be summed together. Each published row is already aggregated;
the app does not recompute customer histories. It reads one bounded result for
the selected store, derives available channels, and presents only the chosen
channel. Duplicate channel/cohort/age rows or changing cohort sizes are errors.
The published surface currently covers online DTC and Amazon separately.

- Monthly retention = that month's purchasing customers / original cohort size.
  It can rise after a customer skips a month; it is not subscription survival.
- LTR = cumulative net revenue / original cohort size.
- LTV = cumulative gross profit / original cohort size. Missing warehouse cost
  inputs can overstate it; no CAC or payback claim is made.

Two **cohort-age curves** show monthly retention and cumulative gross profit LTV
on separate axes. **Chart cohorts** (`?cohorts=recent|earliest`) selects the latest
or earliest six of the twelve acquisition months. Every cohort gets its own
line; only elapsed ages are plotted. Markers keep a cohort's first observation
visible; missing values break the line. Percentage ticks and server-formatted
tooltips make the units explicit. Both charts retain **View as table**.

The curves and matrix reuse the same values, denominators and missing-age rules
from `retentionMatrix`; they add no warehouse query. **Matrix measure** changes
the twelve-cohort heatmap between retention, LTR and LTV independently of the two
fixed charts.

No averages across cohorts, stores or channels are shown. Unelapsed months are
blank; missing published values say **No data**, and a real zero remains zero.
Elapsed time does not establish warehouse completeness. Cohort money/counts
are cast to NUMERIC in SQL: this preserves canonical INT64/NUMERIC inputs and
accommodates demo masking's FLOAT64 values, rounded to nine fractional places.
Per-customer ratios are approximate. The misleading `cohort_month_*` legacy
fields are deliberately unused; some published implementations sum those across
all ages despite their names. The [published cohort schema](https://sourcemedium.com/docs/data-activation/data-tables/sm_transformed_v2/rpt_cohort_ltv_by_first_valid_purchase_attribute_no_product_filters)
and [query guidance](https://sourcemedium.com/docs/data-activation/template-resources/sql-query-library/ltv-and-retention)
describe the underlying report.

`CohortMatrix` only renders formatted cells and intensity shades. Retention owns
the formulas, eligible ages and missing-value decisions. To remove either view,
delete its feature folder, route folder and navigation entry as usual.

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

## CSV downloads

Paid marketing's **Download CSV** re-reads the applied store, dates and channel
with the same campaign query as the table. It includes all loaded campaigns
across the table's pages, up to 200, in the query's spend order. It does not
run the chart query or start a background export job. Unapplied filter edits
are ignored. Each row includes the store, inclusive dates, sample/live mode,
configured reporting currency (blank when unset), and `export_truncated`.
A bounded partial result sets that flag to `true` and uses `-partial-` in the
filename; it is not a complete campaign export.

Amounts and counts retain their raw precision in the CSV; ratios are numeric,
and CTR is a fraction (`0.05` means 5%). Spreadsheet programs can round large
numbers when opening CSVs: import exact amounts and identifiers as text when
that precision matters. Text cells that could execute as spreadsheet formulas
receive a leading apostrophe. Treat CSV as data when importing it: spreadsheet
re-saving can remove formula escapes ([OWASP guidance](https://owasp.org/www-community/attacks/CSV_Injection)).
Downloads require the same viewer guard as pages
and use `private, no-store` responses.

For another feature, copy `paid-marketing/download.ts` and its route re-export.
Reuse `src/lib/csv.server.ts` for encoding, mark numeric columns explicitly,
reuse the feature's guarded loader, and include its filter and truncation
context. Keep the route under the feature's own route folder so removing the
example removes its download too.

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
