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

Use `get_data_context` (your project and datasets), `search_data_catalog`
(search, and describe tables with its `tables` argument; connections on the
earlier tool set list `describe_table` for that), and `query_metrics`. Full guide:
https://sourcemedium.com/docs/ai-analyst/connect-an-ai-assistant

**`pnpm schema <relation>`** prints a relation's columns and types through the
app's own key (never rows). Without live configuration it prints a bundled
snapshot of SourceMedium's published schema, which may differ from yours.
Codex Cloud and Claude Code Cloud can reuse the previews' [Development app
credential](cloud.md#debug-with-live-data) in environment settings to run this
command against your warehouse. MCP is not required for that path.

## The example's relations

| View           | Relation                                                              | Grain                                                                               | Columns used                                                                                                                                                           |
| -------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview       | `rpt_executive_summary_daily`                                         | store, channel, sub-channel, date                                                   | `order_net_revenue`, `ad_spend` (NUMERIC), `order_count` (FLOAT64), `website_sessions`, `ad_clicks` (INT64)                                                            |
| Paid marketing | `rpt_ad_performance_daily`                                            | ad by day                                                                           | `sm_channel`, `ad_campaign_id`, `ad_campaign_name`, `ad_spend`, `ad_impressions`, `ad_clicks`, `ad_platform_reported_conversions`, `ad_platform_reported_revenue`      |
| Creatives      | `rpt_ad_performance_daily`                                            | ad by day, aggregated to creative                                                   | `ad_creative_*` text and image URLs, the same measures                                                                                                                 |
| Orders         | `obt_orders`                                                          | one row per order                                                                   | `sm_order_key`, `order_name`, `order_processed_at_local_datetime`, channel, type, status, quantities, and the order's revenue columns                                  |
| Products       | `obt_order_lines`                                                     | one row per order line, aggregated to product or variant                            | `source_system`, product/variant ids and titles, `is_order_sm_valid`, `order_line_net_revenue`, `order_line_net_quantity`, `order_line_product_gross_profit` (NUMERIC) |
| Retention      | `rpt_cohort_ltv_by_first_valid_purchase_attribute_no_product_filters` | channel, acquisition cohort month, month age, one acquisition dimension/value slice | `cohort_size`, `customer_count`, `cumulative_order_net_revenue`, `cumulative_order_gross_profit` (FLOAT64, cast to NUMERIC)                                            |

The example uses these formulas: net revenue is
`SUM(order_net_revenue)`, revenue per summary order is net revenue ÷ summary
orders, MER is
net revenue ÷ ad spend, CPC is spend ÷ clicks, and platform ROAS is
platform-reported revenue ÷ spend. Overview implements the catalog's Executive Summary metrics
(`order_net_revenue_summary`, `order_count_summary`, `total_ad_spend_summary`). The relation
publishes a row for every `sm_channel`, including `draft_orders`, `exchanged`, `excluded` and
`*_via_shopify` rows. Those are not sales, and `*_via_shopify` repeats orders already counted in
their direct channel, so the catalog's order count and net revenue filter to the five channels
SourceMedium counts as valid (`online_dtc`, `amazon`, `retail`, `wholesale`, `tiktok_shop`).
Ad spend and sessions are not order validity and count every row, so MER divides valid revenue
by all spend. The summary reports apply the same rule to every order measure through
`validSales()` in `src/lib/data/channel-sql.ts`; a test checks its predicate against the vendored
catalog definition. **Sales channel** defaults to **All sales channels**; select one to narrow
KPIs, trends, comparisons, summaries and CSV to it. Selecting a non-valid channel shows its spend
and no sales. The options are queried for the selected store and dates. The Looker template may
open on `online_dtc`, so match its channel before comparing numbers. This is an implementation
match, not an independent numerical reconciliation. Summary orders are published order measures
and can differ from valid orders in `obt_orders`. The UI labels that count and its revenue ratio
explicitly; do not present the ratio as valid-order AOV without reconciling the definitions,
dates and store.

Overview's ad spend reads `rpt_executive_summary_daily`; Paid marketing and
Creatives read `rpt_ad_performance_daily`. The two published relations can
differ by cents for the same store and dates, so do not expect them to match
exactly or reconcile one against the other in code.

Overview's **New vs repeat purchases** reads the same summary relation and
filters. It sums `new_customer_order_net_revenue`, `new_customer_order_count`,
`repeat_customer_order_net_revenue`, and `repeat_customer_order_count` in the
existing query. Counts are published order measures (FLOAT64), not distinct
customers. Net revenue per order divides each group's period revenue by its
own order measure; a missing or zero denominator has no ratio. Classification
coverage varies by source, so the two groups are not forced to add up to the
headline totals. Missing measures stay missing, and comparison uses the same
published fields and filters. These are summary measures, not valid-order AOV.

Overview's **Revenue and deductions** adds `order_gross_revenue`,
`order_discounts`, and `order_refunds` to the same scoped query. Deductions retain
their published signs. This detail is collapsed by default, with no additional
query when expanded. The table keeps published net revenue and computes
`net - gross - signed discounts - signed refunds` with exact decimal arithmetic.
A nonzero result is an **Unreconciled difference**, not an invented adjustment
category. Missing inputs prevent reconciliation. These summary dates do not
establish when a refund was issued. Comparison follows the existing coverage gate.

**Acquisition economics is deferred.** Before adding unique new-customer counts
or acquisition ratios, verify customer additivity and comparable spend/customer
coverage within the selected sales channel. A channel filter alone does not
establish that alignment. The inspected published `new_customer_count` total
did not reconcile to distinct first-valid-purchase customers; the cause remains
unresolved. The app does not query that count or expose acquisition ratios.
The existing new/repeat purchase table continues to report order measures.

Overview's KPI trends reuse its daily rows with no additional queries. Each
trend links to the existing **Business summary** in Daily mode, with the same
store, dates, channel and comparison. This table includes revenue per summary
order alongside the other KPI measures. Missing dates remain gaps; unsafe
INT64 values use the table only. Daily ratios are computed
per day, while headline ratios continue to use full-period totals.

Overview's **Performance trends** offers Daily and Cumulative values for net
revenue, summary orders and ad spend, using the same bounded daily query.
Cumulative money adds exact decimals before chart conversion. Each period
starts at its own first date; a missing date or measure makes the affected
cumulative series unknown from then on. Calendar comparisons accumulate their
own complete period before aligning dates, including leap days. KPI cards,
sparklines, summary rows and CSV remain period or daily values.

**Largest daily revenue changes** is optional comparison detail, ranked by
exact absolute change across matched dates. It reuses daily rows and the
existing period-coverage gate. Missing values and unmatched leap days are
excluded; the detail disappears when comparison is off or unavailable. These
are descriptive date contributions, not an attribution or causal explanation.

Retention defaults to the existing unsegmented cohorts. **Segment cohorts by**
selects one published first-order attribute, then one **Acquisition segment**:
order type, discount code, source/medium, campaign, survey attribution or
sub-channel. The report explicitly excludes product and SKU slices. Values
are scoped to the selected store, channel and twelve-cohort window. A bounded,
searchable options query runs only when segmentation is selected, using age-zero
rows and returning at most 200 values with a visible partial-list notice.
The cohort query reads exactly one dimension/value slice, never a sum of
potentially overlapping segments. Missing or unknown choices stay empty.
Changing dimension clears its old segment and search. Options-query errors
keep the applied controls available and still show their remedy. Switching
stores clears segment values and search while keeping the selected dimension. The selection is kept
in report URLs; segment values and search text are excluded from agent prompts.

Target pacing remains deferred: published targets coalesce missing values to
zero, so the report alone cannot distinguish an absent target from a configured
zero. Establish target-presence semantics before presenting attainment.

## Store scope

Individual report queries filter one store with `sm_store_id = @store_id`. The
All stores report uses the explicitly bounded portfolio query described below.
There are no cross-store totals. The store picker reads `dim_stores`: one row per active
store, with `sm_store_id`, `store_name`, `store_url`, `store_logo_url`, `brand_name`, `store_timezone`
([dates](#dates)), and `store_currency_code` ([money](#money-and-currency)).
It groups stores by
brand and labels each store with its name, then the domain from `store_url`,
then its store ID. Blank names and missing or invalid website URLs fall through
automatically; neither is required. Duplicate labels include the ID.
Website domains also appear beneath named stores. Configured HTTPS logos appear
in the header and picker; missing, invalid, or broken logos fall back to initials.
The browser loads logos without sending the report URL as a referrer.
The selected value and shareable URL remain `?store=<sm_store_id>`, so renaming
a store does not break links. `app.config.ts` `storeLabels` is an optional
name override, not a required setup step. The roster is bounded to 50 stores;
overflow or duplicate IDs is an error rather than an incomplete picker.

The persistent **Switch store** picker searches names, domains, brands and IDs.
Use arrow keys or Tab to move through results, Enter to select, and Escape to close.
**All stores** stays available below the results, including during search. Switching stores
preserves applied dates and presentation choices, ignoring unfinished date edits.
It clears campaign/order identities, order search and pagination from the old store.
**All stores** opens `/stores`, with one row per roster store, including stores
without rows. Its `store` URL parameter is only the reference for default dates
and return navigation; it does not narrow the portfolio. Explicit dates are the
same calendar dates in each store's local time. Each row uses its verified reporting
currency and its own period coverage; currencies are never inferred from nominal
store metadata. Money is neither totaled nor ranked across stores.

`src/features/stores/bigquery.ts` is the sole feature exception to the scalar
store predicate. Both exported loaders reject `APP_STORE_ID` deployments before
querying. The live loader obtains IDs from `loadStores()`, encodes them as a JSON
STRING parameter, and filters using `sm_store_id IN UNNEST(JSON_VALUE_ARRAY(@store_ids))`.
One summary query groups by store with `maxRows: MAX_STORES`; it never accepts
browser-supplied ID lists. The warehouse's existing fixed-store scalar-parameter
check provides a second boundary. Contract tests cover auth, fixed-store denial,
parameterization, exact money, missing stores and truncation. Fixed-store apps hide
All stores and redirect direct visits to an allowed individual report.

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
the parameter, not arbitrary SQL semantics. `pnpm check` fails any SQL template under
`src/features` that reads `warehouse.table(...)` without its own copy of that
predicate, and each view's `live-contract.test.ts` checks the parameters. A
textual check cannot prove every join is scoped: review joins and subqueries when
extending the app. Store-free custom data needs a deliberate authorization
design before exposing it from a restricted deployment. After that review, list
the file and its reason in `STORE_SCOPE_EXEMPT` in `scripts/lib/store-scope.ts`;
never add a placeholder predicate to satisfy the check.

Orders are listed by `order_processed_at_local_datetime`, the column
SourceMedium partitions `obt_orders` on, so a date range reads only the months
it covers. Filter large tables on their partition column whenever you can.

## Writing a query

Inside your guarded loader:

```ts
const { warehouse } = await requireViewer({ live: true, storeId: filters.storeId });
const result = await warehouse.query({
  name: "top_products", // becomes the sm_query job label
  maxRows: 200,
  partial: true, // a list that says when more matched; see below
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
return {
  rows: decodeRows(TopProductRow, result.rows, "your_relation"),
  truncated: result.truncated,
};
```

- Browser input only ever becomes a parameter value, or picks a key from a
  fixed map in code (see `creatives/bigquery.ts`). Never concatenate it into SQL.
- `warehouse.table()` builds the fully qualified name from your configuration:
  `table("obt_orders")` for SourceMedium's transformed dataset,
  `table("dim_data_dictionary", "metadata")` for its metadata dataset, and
  `table("customized_views.my_table")` for any other dataset in your warehouse
  project that the app can read.
- Aggregate in SQL. `maxRows` bounds the rows returned across pages. More rows
  than that fail with `result_too_large`, so a total or picker is never computed
  from part of a result. A list that can say it is partial sets `partial: true`
  and reads `result.truncated`: pass it to `<DataTable truncated={data.truncated}>`
  or show the view's truncation warning. Independently, the client
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

`dim_stores.store_currency_code` is nominal store metadata. It does not prove
the currency of published money columns, so it never chooses a live report's
money label. Verify the monetary inputs used by these views, then set
`app.config.ts` `currency` to their reporting ISO code. For stores with different
verified reporting currencies, override by exact store ID in `reportingCurrencies`,
for example `{ "store-a": "CAD", "store-b": null }`. An explicit null override
leaves a store unlabeled even when the deployment has a default code.

Reports, the footer, the agent prompt, and CSV `reporting_currency` share this
setting. Null or an unrecognized code leaves live amounts unlabeled; the footer
says the currency is unverified. This is an operator-verified contract, not
automatic currency detection. Synthetic sample amounts always use USD.
These settings label amounts without converting them or changing calculations.
A code counts as recognized only when it is a real ISO 4217 code the runtime
publishes (`isCurrency` in `src/lib/format.ts`), not any three letters Intl
would format. Formatting respects each currency's minor units (JPY has none,
BHD has three) and disambiguates dollars (`CA$`, `A$`) in the configured locale.

An app SourceMedium hosts reads a third source: the workspace reporting
currency its data API publishes with the app's context (`reporting_currency`,
an optional, additive field). It applies only to stores `app.config.ts` leaves
unset, and the Connection page says where the label came from. An older data
API publishes none, and amounts stay unlabeled as before.

`store_timezone` is the store's SourceMedium time zone, which sets the
store's dates in the app (see [dates](#dates)); it is not every source's date
convention (Amazon order local times use America/Los_Angeles). The bundled
schema documents all seven metadata fields. The picker reads the identity,
name, brand, time zone, and currency. Websites and logos are not fetched.

Keep conversion in SourceMedium or the warehouse, and read the standard
published fields (`order_net_revenue`, `ad_spend`, and related measures).
Pass the report store's currency into `formatMoney`. Chart axis ticks stay
compact numbers without a currency symbol, because that formatter is shared
with counts.

When currency conversion is enabled, supported standard monetary fields use
the configured reporting currency, which can differ from nominal store currency.
Unsupported ad sources retain account currency. Amazon Ads uses the store's
configured currency independently of workspace reporting currency. Manually
configured costs are not automatically converted. Before labeling reports or
combining inputs, verify order, ad, platform-reported revenue, and cost currencies
for the selected store. Gross profit requires costs in the revenue currency.
If inputs differ, align them upstream or narrow the affected view's scope;
setting a label or leaving it blank cannot repair mixed-currency calculations.
See SourceMedium's [reporting currency rules](https://sourcemedium.com/docs/help-center/core-concepts/data-definitions/reporting-currency).

- Inspect each column's type. Order revenue and ad spend are NUMERIC: decode
  with `bq.numeric()` and keep exact decimal text. Platform-reported revenue
  is FLOAT64: decode with `bq.float64()`; it is approximate at the source.
- Add NUMERIC values with `sumDecimals` (`src/lib/data/decimal.ts`), never as
  JavaScript numbers. Ratios use `decimalToNumber` and `ratio`.
- Never add money across stores. Each store is labeled with its verified reporting currency
  code. Use a separately scoped app when a deployment should show one store.

For order reconciliation, inspect `order_original_currency_code`,
`order_converted_currency_code`, `is_order_currency_canonicalized`, and
`order_original_*` / `order_converted_*` amounts. `order_currency_code` remains
the source transaction currency; do not use it to label report money.
The summary and advertising tables do not repeat a currency code on each
row. Verify their upstream currency contract instead of inferring it from store metadata.
Discounts and refunds are normally signed negative amounts; read published
net revenue rather than subtracting those signed amounts again.

## Dates

Warehouse dates are calendar dates in each store's SourceMedium time zone,
`dim_stores.store_timezone`. The app uses the selected store's zone for today,
the date presets, the default range (ending yesterday) and the latest
selectable end date, and each dated report's footer names it. There is no
setting and no UTC default. Where `dim_stores` has no recognized zone for the
store (or is not published yet, or the store list fails), the zone is the UTC
offset SourceMedium applied to the store's recent orders, preferring non-Amazon
sources. A listed store with neither shows an error rather than a guessed date.
In a view, take today and the zone from `ReportContext.today` and
`ReportContext.timeZone`; a route handler calls `resolveReportStore()` in
`src/lib/data/stores.server.ts`, as `csvExport()` does. Moments such as
**Queried at** and an order's created time show in the store's zone, named.
Never use the server clock's date or UTC.

Date presets include Yesterday, Last 7/28/90 days, Last full week
(Monday–Sunday), Last month, and Month to date through yesterday. They use
the store's calendar dates, like the picker defaults. Month to date is omitted on
the first of the month, when it has no completed days. Presets longer than
the configured maximum range are omitted rather than silently shortened.

## Period comparisons

Every time-based report compares the selected range with up to two baselines
at once, and what a baseline means depends on what the range is
(`rangeIntent()` in `src/lib/comparison.ts`, judged against the store's date):

| Selected range                   | Previous period                             | Same period last year       | 52 weeks earlier |
| -------------------------------- | ------------------------------------------- | --------------------------- | ---------------- |
| One day                          | Same weekday a week earlier                 | Same calendar date          | 364 days earlier |
| Rolling N days ending yesterday  | The N days before                           | Both dates one year earlier | 364 days earlier |
| A full calendar month            | The previous full month, lengths may differ | The same month last year    | 364 days earlier |
| Month to date                    | The previous month through the same day     | The same dates last year    | 364 days earlier |
| A full quarter / quarter to date | The previous quarter / its matching days    | The same quarter last year  | 364 days earlier |
| Anything else                    | The equal-length range before               | Both dates one year earlier | 364 days earlier |

Position-aligned baselines (previous N days, 52 weeks earlier, quarter to date)
require equal day counts. Calendar-aligned ones (last year, a previous month or
quarter) may differ in length; the caption shows both day counts, and daily
overlays leave days the shorter period lacks as gaps. A previous month that is
shorter than the elapsed days of a month-to-date range has no match and says so.
February 29 has no exact last-year date. **Off** skips every comparison query.

The settings live in the URL: `compare` is the first slot (`previous`, `year`,
`weekday`, `off`; `off` turns both off). Older links keep working, but
`previous` now follows the table above, so a link to a single day or a full
month compares with a different period than it used to. `compare2` is the
second slot (default `year`, or `previous` when the first is already last
year), and `baseline=a|b` picks which slot the charts and tables show. A second
slot that resolves to the same dates as the first is not queried; it says it
matches. KPI cards show one change row per slot, each labelled with its baseline
("vs previous 28 days") and exact dates. Charts overlay one baseline and tables
show one change column; the caption's switch changes both without a request,
because both slots' data arrive with the page. Comparison settings survive
filters, report links and navigation. Only views that implement comparisons
show the controls.

Data loads in date order, so a day that has not loaded yet is missing from the
end of the selected period, where it would read as a decline. Reports hide a
slot's period-total changes (its KPI row and change column) when the selected
period has more days without rows at its end than that baseline, or when a
position-aligned pair differs in length, and the caption says why. Each slot
decides independently; a failed last-year query never hides the current values
or the other slot. Gaps earlier in a period do not hide changes. Per-day
comparison lines still show, with gaps for missing days. Missing days stay
missing, never zero, and a range including today may be incomplete.

To add comparisons to a view, opt into `ReportPage comparisons` and read
`plan` from the report context: `planRanges(plan)` gives both slots' dates for
a query, `slotChanges(plan, coverage)` says for each slot whether changes can
show, and `comparison` is the active slot for an overlay. Query every period
with the same store and dimension filters. Copy Overview's `getOverviewReport`
to run the existing bounded query once per period in parallel, keeping current
data visible if a comparison query fails, or compare in one pass as Products,
Paid marketing, Geography and All stores do: group with `periodSql()`, select
`PERIOD_COVERAGE`, pass `periodParams(range, first, second)` and decode with
`periodCoverageFields` (`src/lib/data/period-sql.ts`). The windows are an OR of
bounded ranges, never the span between the earliest and latest date, so a
partition filter prunes each one; a DATETIME partition column uses
`dateTimeRows(column)`. Columns come back as `name`, `previous_name` and
`second_name`. Show both slots on KPI cards with `KpiCard deltas`
(`kpiDelta(..., baselineLabel(slot))`, or `unavailableDelta(slot)` for a slot
with no change to show), and render the per-slot variant of a table or chart
inside `ActiveBaseline` so the caption's switch can show either one.
Ratios are recomputed from each period's totals, not averaged from daily ratios.

`lib/comparison.ts` owns date rules and arithmetic; `patterns/kpi-delta.ts`
owns server-formatted KPI changes. Absolute money/count changes stay exact.
Percentages are `(current - baseline) / baseline`, displayed to two decimals.
Zero, negative, and missing baselines have explicit states instead of a
misleading percentage. Unchanged values are neutral. The default color is
neutral; a feature must explicitly choose whether higher or lower is better.
Overview uses higher-is-better for net revenue, Summary orders, MER and
website sessions. Percentage-valued metrics should label absolute changes as
percentage points, distinct from relative percent changes. Product gainers and
decliners rank against the first slot. Targets and custom baselines are
intentionally left for apps that need them.

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

Paid marketing's **Spend breakdown** ranks channels, campaigns, published campaign types or tactics with
`?breakdown=channel|campaign|type|tactic`. It adds one bounded SQL query that reads the
selected and comparison periods with identical store/channel filters. Comparison
Off excludes baseline rows. Shares use full-query spend before the top-10 limit;
the caption identifies top-10 results. Zero totals and negative spend suppress
shares; absent baseline values stay absent, not zero. The comparison control
applies to this breakdown; the existing delivery chart and campaign table show
the selected period.

Paid marketing's trend also offers platform revenue, platform ROAS and cost per
conversion, with `?grain=day|week|month`. The bounded SQL daily aggregates are
summed before dividing, including channels folded into Other. Weeks start Monday;
edge intervals include only selected dates. These are platform-attributed returns,
not blended MER or incremental revenue. Classification values come directly from
`ad_campaign_type` and `ad_campaign_tactic`; unclassified rows stay `(none)`.

When Creatives is in the configured navigation, campaign links open it with
`store`, dates, `channel` and `campaign` intact. Removing that view leaves plain campaign labels.
Creatives' `?view=delivery|returns|table` keeps delivery cards as the default and
adds return cards and a sortable return table. Revenue, ROAS and cost per conversion
use period sums before the top-48 bound. Spend remains the default sort; conversions
remain visible alongside returns. Platform attribution may overlap across channels.
Only HTTPS Facebook/Instagram URLs published by the source become **Open ad**
actions, with host and credential validation; URLs are never constructed from IDs.

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
them. JS-driven selects stay non-interactive until their handlers are attached,
while retaining their values in form submissions. Early changes cannot be lost during loading. Reports and their filters require
JavaScript. Date preset links
use the already applied filters. **More dates** holds the less frequent presets.
Invalid or overlong date URLs show a correction message and no report until a
valid range is applied.

On phones, Overview and Performance use `ReportControls` to show applied scope
above an expandable filter panel. Collapsed fields stay mounted and continue to
submit with the report form. Channel checkboxes are drafts until submission;
the quick selector and scope summary keep showing the applied channels, with a
notice for unapplied changes.

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

Product rankings also offer refund amount and refunded units. Their published
negative signs are reversed for positive deductions; positive source reversals
remain negative. Refund rates use refunded units / original ordered units from
`order_line_quantity`, not net units. These describe orders processed in the
selected dates and can change when later refunds arrive.

Cost coverage appears below the headline totals when ranking by product gross
profit. Refund rates appear when ranking by refund amount or refunded units.
Revenue and net-unit rankings do not load this extra aggregate.
Cost coverage counts real valid-order product lines (`order_line_id IS NOT NULL`)
whose final `order_line_product_cost` is null separately from lines with a
published zero. Synthetic order-summary rows are excluded from these counts.
Unit and refund sums retain all matching rows, including summary adjustments.
Counts and refund denominators
cover all matching products in a separate narrow aggregate, independent of the
ranking limit. Its data region can fail without hiding the rankings. Splitting
coverage from descriptive product fields reduces bytes per query, but adds a
read when these diagnostics are used. Zero may be intentional or unconfigured and is never silently
classified as missing or proof of complete costs.

**Retention** uses `?as_of=YYYY-MM&channel=online_dtc&measure=retention|second|revenue|profit`.
The cutoff defaults to the store's last completed calendar month and is frozen in
shared links. A link naming a month the report cannot show (not yet complete, or
malformed) gets a correction notice, never a silently different month. It shows twelve acquisition months through that cutoff, at ages
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
- Purchased a second time = `cumulative_second_order_count` / original cohort size.
  This is cumulative through the age, including second orders during Month 0,
  distinct from monthly retention and rolling 30/60/90-day windows.
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
the twelve-cohort heatmap between monthly retention, second purchase, LTR and LTV independently of the two
fixed charts.

No averages across cohorts, stores or channels are shown. Unelapsed months are
blank; missing published values say **No data**, and a real zero remains zero.
Elapsed time does not establish warehouse completeness. The published cohort
money and counts are FLOAT64; SQL casts them to NUMERIC, rounded to nine
fractional places, so they decode exactly from that point on. Values are
therefore no more exact than the FLOAT64 source, and per-customer ratios are
approximate. The misleading `cohort_month_*` legacy
fields are deliberately unused; some published implementations sum those across
all ages despite their names. The [published cohort schema](https://sourcemedium.com/docs/data-activation/data-tables/sm_transformed_v2/rpt_cohort_ltv_by_first_valid_purchase_attribute_no_product_filters)
and [query guidance](https://sourcemedium.com/docs/data-activation/template-resources/sql-query-library/ltv-and-retention)
describe the underlying report.

`CohortMatrix` only renders formatted cells and intensity shades. Retention owns
the formulas, eligible ages and missing-value decisions. To remove either view,
delete its feature folder, route folder and navigation entry as usual.

## Refresh and freshness

**Refresh data** re-reads the current report from the warehouse with the filters
already applied in the URL. Its server action (`src/lib/refresh.ts`) returns
the re-rendered page in its own response and marks that one request to bypass
the [query cache](#the-query-cache), so every query runs again and replaces what
the cache held. It keeps the report visible while loading and disables repeat
clicks.
Unapplied filter edits are not submitted. Refreshing the app does not trigger
SourceMedium's ingestion pipeline. Reports do not poll or refresh automatically.

Each `DataRegion` shows **Loaded at** only after its data loads successfully,
including an empty result. The time is when the section finished loading, not
when page rendering began. When the query cache served any result in that
request, the line adds **includes cached results queried at** with the oldest
origin time, so a cached number is never presented as newly queried. Errors get
no success timestamp. Sample mode labels the time **Sample loaded at**, since it
runs no warehouse query.

Pages also show **Data freshness unknown**. The query time does not tell you
how current the warehouse is. Do not use `MAX(date)` as
freshness: `rpt_executive_summary_daily` includes forward-dated target rows,
which is also why date ranges end no later than today.

Showing a table's own snapshot time, labeled as such (for example "Inventory
snapshot as of …" from `inventory_snapshot_at`), is fine: it describes that
table, not how current the whole warehouse is.

There is no cache of HTML or RSC output. Repeated auth and store-list reads are
deduplicated within one server render; credentials are reused until shortly
before expiry. BigQuery can serve eligible repeated queries from its
[native query cache](https://docs.cloud.google.com/bigquery/docs/cached-results);
that layer is separate from the app's own query cache below, is reported as
`cache_hit` in the logs, and is not bypassed by Refresh. Browser Back/Forward
can restore a previous report; use **Refresh data** to re-read it.

## The query cache

Repeated reads are served from a private cache inside the Warehouse
(`src/lib/data/query-cache.server.ts`), below every feature loader and after
`requireViewer()` and the fixed-store check. A query opts in with one field:

```ts
cache: CACHE_POLICY.aggregate, // src/lib/data/query-cache.ts
```

No field means the query runs on every request, which is the right default for
anything that lists individual orders, customers or evidence rows; `pnpm check`
fails if `src/features/orders` ever sets one. The policies are in one place:

| Policy          | Age  | Used by                                                          |
| --------------- | ---- | ---------------------------------------------------------------- |
| `schema`        | 60 m | The metadata capability probe                                    |
| `storeTimeZone` | 60 m | A store's order offset when `dim_stores` has no zone             |
| `catalog`       | 15 m | Metric definitions, field documentation                          |
| `roster`        | 5 m  | The store list                                                   |
| `aggregate`     | 5 m  | Period totals, series, rankings and the option lists beside them |
| `observation`   | 60 s | The dictionary's per-store observations behind the status strip  |

Expiry is hard: nothing stale is served and nothing revalidates in the
background. Entries hold rows in BigQuery's wire format, so decoders run after
the cache and exact decimals survive it. Errors are never stored; a truncated
result is stored only when the query declared `partial`. Results over 256 KiB
serialized are served but not stored. The key is a digest of the deployment
environment, app, project, datasets, query name, SQL, typed parameters and
bounds, never a viewer or token: every signed-in viewer of a deployment sees
the same data, and the checks that decide who is signed in and which store they
may see run before the cache.

Two tiers share that key. Memory (this isolate, bounded, with single-flight so
concurrent identical requests run one job) is always on. The `APP_QUERY_CACHE`
KV binding, when the Worker has one, keeps entries across isolate restarts and
locations; see [docs/cloud.md](cloud.md#query-cache). Without it the Connection
page says the cache is memory only. A KV failure logs a warning and the
warehouse answers as before.

Every query line in the logs carries `app_request_id` (one per request) and
`app_cache` (`miss` or `bypass` when the warehouse ran; a separate `app_cache`
event records `hit`, `skip` and `error`). Count warehouse jobs and
`app_cache` values to see what the cache saves; BigQuery's `cache_hit` is its
own layer.

## CSV downloads

Paid marketing's **Download CSV** re-reads the applied store, dates and channel
with the same campaign query as the table. It includes all loaded campaigns
across the table's pages, up to 200, in the query's spend order. It does not
run the chart query or start a background export job. Unapplied filter edits
are ignored. Each row includes the store, inclusive dates, sample/live mode,
the selected store's verified reporting currency (blank when unverified), and `export_truncated`.
A bounded partial result sets that flag to `true` and uses `-partial-` in the
filename; it is not a complete campaign export.

Amounts and counts retain their raw precision in the CSV; ratios are numeric,
and CTR is a fraction (`0.05` means 5%). Spreadsheet programs can round large
numbers when opening CSVs: import exact amounts and identifiers as text when
that precision matters. Text cells that could execute as spreadsheet formulas
receive a leading apostrophe. Treat CSV as data when importing it: spreadsheet
re-saving can remove formula escapes ([OWASP guidance](https://owasp.org/www-community/attacks/CSV_Injection)).
Downloads require the same viewer guard as pages
and use `private, no-store` responses. An invalid date range, an end date after
today, or a range longer than the configured maximum returns HTTP 400 with the
same message the page shows; a download never silently uses another period.

For another feature, copy `paid-marketing/download.ts` and its route re-export.
Wrap the export in `csvExport()` from `src/lib/csv.server.ts`, which applies the
page's store and date checks, and use `csvResponse()` for encoding. Mark numeric
columns explicitly, reuse the feature's guarded loader, and include its filter
and truncation context. Keep the route under the feature's own route folder so removing the
example removes its download too.

## Metadata

`src/lib/data/catalog.server.ts` reads the published `dim_data_dictionary`
(documented columns of a relation, for one store) and
`dim_semantic_metric_catalog` (SourceMedium's metric definitions, which have no
store column). A metric's `calculation` is documentation, not runnable SQL.
Both are optional: a page can read any relation the app can reach.

Each example's **About this data** panel declares its sources with `ReportPage
sources={[{ relation, scope }]}`. Reuse the relation constant from `rows.ts` and
explain the query's scope, including aggregation and exclusions. The shared
shell does not import features. Removing a feature removes its source declaration.

The panel fetches only field documentation for the selected source and store,
when opened. Sample mode uses the bundled schema snapshot; live mode reads the
warehouse dictionary and never substitutes sample documentation on failure.
The read is guarded, bounded to 500 displayed fields, private, and cancelled
when the panel closes or the source changes. Missing metadata does not affect
the report. No warehouse rows, refresh claims, or schema explorer are added.

Metric definitions reuse the loaded report's `KpiCard description` text.
For other existing explanations, add `data-metric-definition="Metric label"`
to their text element. Streamed definitions appear as their regions load.
These explain this app's calculations; published field descriptions can differ.
**Use this field** passes its source, name, type, and documentation to the
existing Vibe code composer. The prompt tells the agent to verify the schema;
metadata is documentation, never executable SQL.

**Explore your data** (`/data`) lists every published metric from
`dim_semantic_metric_catalog` once: alias rows (`is_abbreviation`) fold into
their `preferred_metric_name`, so "AOV" finds Average order value. Rows carry
the published `metric_category` (an older catalog falls back to the metric's
`underlying_model`), the display unit and whether a report shows the metric.
Search and category chips filter the loaded catalog locally and record the
choice in the URL through native history, so they never start a warehouse
request, and no metric value is ever queried to decorate a row. The drawer
explains a metric in plain words first and keeps the canonical name,
calculation, filter, time basis and dependencies under **Technical details**.
**View in report** links to the views whose `nav` entry in `app.config.ts`
declares that canonical name in `metrics`; a metric no view presents says so and
offers **Use in Vibe code**, which hands the canonical identity and reviewed
definition (never row values) to the composer. **Fields** keeps the dictionary
with **Use this field**, and **Data health** shows what the dictionary publishes
per source, without inventing a status for what it does not.

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

A page's dates follow its store's time zone, so its queries wait for that zone.
A server reuses each store's zone for an hour after looking it up, so later pages
whose URL names the store, as the filter bar and navigation keep doing, run their
queries in parallel with the store list. Each BigQuery query
still takes a moment (on the demo warehouse, pages took 1 to 2.5 seconds from
Cloudflare's edge), so keep pages to a few queries each. `LIMIT` does not
reduce cost; filtering on a partition column and selecting fewer columns do.

## Demo reconciliation

The demo warehouse applies privacy masking to numeric metrics. Summary order
counts are scaled, while the number of order rows is not. Consequently, demo
Summary orders need not match a count of valid order rows. Compare Overview
with the catalog's summary metrics, using the same store and dates and every
channel. Do not apply a demo-specific adjustment to customer queries.

### Advertising name filters

Paid marketing and Creatives support **Add name filter** for campaign, ad set /
group, and ad names. Choose Contains, Does not contain, Equals, or Starts with,
and enter values one per line. Matching ignores case and treats punctuation
literally, including brackets, `%`, and `_`. Values within a rule use OR;
separate rules use AND. Does not contain excludes every listed value. Missing
or blank names do not match an active rule on that field.

Rules are stored in the `names` URL parameter for sharing and bookmarking.
The editor and URL parser share the same limits, including a 4,000-character
encoded query budget that leaves room for other filters and navigation headers.
Oversized drafts stay in the editor with a correction message.
They apply to delivery rows before aggregation, using the names recorded in the
selected dates. Reused creative metrics therefore include only matching delivery.
Comparison periods, campaign CSVs, and campaign-to-creative links retain the same
rules. Campaign labels come from matching rows; inspect matching names to see
name variations within the period.
**Matching names** shows up to 50 distinct combinations for inspection; its limit
does not limit report totals. Invalid rules stop the report until cleared.
No naming taxonomy is inferred, and filters never rewrite warehouse names.

## Summary report scope

Overview and Performance tables opt into `appConfig.summaryMaxDays` (366 by default) while detail views retain `dateRange.maxDays` (90). Pass the same maximum to ReportPage and csvExport so the URL, browser validation and download agree. Quarter-to-date and year-to-date presets appear only when they fit the report's bound. Performance uses a grain-specific aggregate row bound and rejects excess platform groups rather than truncating totals.

For multiple sales channels, copy Overview's `SalesChannelFilter` wrapper outside Suspense and `MultiChannelFilter` inside it. The wrapper owns one form value while the roster loads or fails. The shared `SALES_CHANNEL_PREDICATE` accepts bound legacy single-channel values and canonical JSON selections. Keep explicit All selections in links and exports as `sales_channel=` so customer defaults cannot reapply. See [reconciliation.md](reconciliation.md) for metric definitions and reference parity.

## Dashboard definitions and evidence

The optional `bindings` on `ReportPage` are feature-owned presentation bindings,
not a metric registry. `src/lib/metric-binding.ts` compares their reviewed
`contracts/dashboard-metrics-v1/definitions.json` producer snapshots with the
store-free published catalog. Exact dependency IDs, missing definitions, cycles
and changed calculations/filters/time expressions produce findings. They never
change developer-authored SQL. Report-specific calculations omit `canonical` and
continue working. Definition agreement does not prove numerical reconciliation.

`loadReportMetadata` probes optional metadata capabilities, then reads the
store-free catalog and the selected store's observations side by side, with
request deduplication and a shared 2.5-second deadline. Each read is cached for
its own policy (schema an hour, catalog fifteen minutes, observations a minute),
so a cold isolate adds at most three parallel jobs to a report and a warm one
adds none. Dictionary identity is dataset + table + actual store;
repeated column-level table statistics are deduplicated, never summed. Conflicts
stay inconsistent. Permission errors stay denied, while older missing optional
formats retain reviewed formatting. Catalog update time is definition publication,
not business freshness. Coarse flags and dictionary dates do not establish a
successful load, delivery, selected-period completeness or quality-check result.

The status strip is independent of business results. Features with their own
controls set `dataStatusAfterControls` and render the supplied `dataStatus` after
those controls. `/data` reuses the adapter for bounded searchable metrics and
health evidence; Fields reuses AboutData's on-demand dictionary and Use this field.
No generic categorical samples, free text, raw addresses or identifiers are exposed.

## Shipping geography and order date basis

`/geography` reads valid orders from `obt_orders`, by shipping country code and
country-scoped state. It is neither customer residence nor ad-delivery geography.
Explicit `date_basis=processed` uses the canonical processed timestamp with a
created timestamp fallback; `created` is a clearly report-specific time scope.
Orders URLs without the parameter retain their original processed-only behavior.
Created-date SQL has no processed-date pruning predicate. Date ranges use local
warehouse calendar dates, not an implicit UTC conversion.

One aggregate query supplies independent full-population totals, up to 500 groups,
an explicit remainder, comparison evidence and the selected-population trend.
Unknown and unmapped locations remain in the table. Mapped-order coverage uses the
same filtered count, never a top-N denominator. Geography has no ROAS or AOV.
The Orders link preserves validity, geographic filters and date basis; unsupported
comparison transitions are explained before opening selected-period details.

Maps are local Natural Earth 5.1.1 public-domain SVG paths, with provenance,
checksums, projection and code crosswalks in the feature's `assets/provenance.json`.
Only country maps and US state maps ship. Other countries use regional tables.
Geometry loads only within Geography, and only after opting in on mobile. Table
links provide equivalent keyboard selection. Regenerate reviewed assets with
`scripts/build-geography-maps.py`; see its arguments and the provenance sources.

## Performance exploration and attribution

Creatives defaults to Performance (`view=returns` remains compatible). Minimum
spend and fractional conversions apply after period aggregation, before ranking.
Compound platform/creative selections are bounded to four and read independently
of top-N cards. Platform models, attribution windows and conversion-event settings
are unknown unless separately verified. Selection identities are excluded from
automatic agent context. Paid marketing links platform to campaign to creative.

Order detail's Why attributed here reads safe fields from
`fct_order_attribution_signals` only on request, verifies store/order membership and
bounds signals to 100 with truncation disclosure. Priority 1 is the published
per-order winner, not a reusable source code. Missing or multiple winners remain
explicit; contextual evidence never receives invented revenue credit. Click IDs,
full URLs, customer details and survey answers are excluded.

`drillDown` is a pure scope check with explicit destination mappings. It never
infers that sales channel means ad platform. Unsupported filters, populations,
comparisons and date bases require an explanation or a correctly scoped panel.
Sidebar links carry only the shared store, dates and a supported comparison; a new report starts fresh. Store changes clear
entity identities, cursors, searches and creative/order selections.

Overview's optional `/overview/export.json` produces raw results and context from
one request, preserving exact decimal strings and INT64 strings. It includes
filters, population, metric/source identities, timezone, currency verification,
attribution, query times and unknown evidence. It is not an immutable snapshot.
Existing CSV columns and raw values are unchanged. `/geography/export` adds a new
scoped raw CSV with an independently aggregated total.
