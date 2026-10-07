# AGENTS.md

This is a customer-owned Next.js app that reads a SourceMedium BigQuery
warehouse on the server and shows it to a small group of trusted viewers.
Every viewer sees everything the app can read; there is no per-viewer data.
Without configuration it runs on clearly labeled sample data.

Make the first useful SourceMedium data app easy. Prefer the existing defaults
and copy the closest view before introducing a new pattern. Add configuration
only for real customer differences; share code when multiple views need it.
Keep feature code explicit and examples independently removable. Put release
verification in maintainer docs, not extra steps in the customer's workflow.
UI primitives own styling and interaction; shared patterns own report behavior;
features own their queries and presentation. Shared code never imports a feature.
Keep only UI components the app uses; add more when a view needs them.

## Commands

- `pnpm dev`: checks configuration, then serves on http://127.0.0.1:3000.
- `pnpm check`: format, lint, types, auth coverage, skill copies, all tests. Under a minute.
- `pnpm schema <relation>`: a relation's columns and types (never rows).
- `pnpm skills:sync`: run after editing anything in `.agents/skills`.

Also: `pnpm diagnose` (full configuration and warehouse check), `pnpm test:e2e`,
`pnpm build`, `pnpm build:cloudflare`. Use `pnpm run deploy`, never `pnpm deploy`
(a pnpm built-in).

## Repo map

```text
app.config.ts                 Name, logo, navigation, store labels, date defaults
src/app/(app)/<route>/page.tsx  One line re-exporting a feature's page
src/features/<view>/          One view: queries.ts (contract), rows.ts (row schema),
                              bigquery.ts (live SQL), sample.ts (fixtures), page.tsx
src/components/shell/         Sidebar, top bar, mode chip, filter bar, report page frame
src/components/patterns/      KPI card, data table, card grid, data states, DataRegion
src/components/charts/        Recharts chart card with a table view
src/components/ui/            shadcn/ui primitives, copied and editable
src/styles/tokens.css         Colors, fonts, radius, chart palette (the rebrand file)
src/lib/auth/                 requireViewer(), Basic and Cloudflare Access guards
src/lib/config/env.server.ts  The only configuration parser
src/lib/data/                 BigQuery client, decoders, errors, catalog, store roster
src/lib/filters.ts, format.ts URL filters; server-side number and date formatting
docs/                         Guides (index below)
```

## The five rules

1. **Call `requireViewer()` in every data function.** Every exported async
   function in `bigquery.ts` and `queries.ts`, every route handler, and every
   server action starts with `await requireViewer()`. The warehouse comes only
   from `await requireViewer({ live: true })`; never import
   `lib/data/warehouse.server.ts`. `pnpm check` enforces both.
2. **Format dates and numbers on the server** with `src/lib/format.ts`, and pass
   strings to client components. Locale formatting anywhere else in `src`, or
   importing `format.ts` into a `"use client"` file, fails lint, because server
   and browser can disagree.
3. **Keep filters in the URL** (`?store=&from=&to=` plus the view's own). Read
   them in the page's `searchParams`; there is no client data store.
4. **Inspect the schema before writing SQL**: the SourceMedium MCP
   (`describe_table`) or `pnpm schema <relation>`. Never guess a column.
5. **Never paste a secret** into a chat, a file, a commit, or a log. Do not read
   any `.env*` (except `.env.example`) or `.dev.vars*`; ask the person to run
   `pnpm diagnose` and share its output instead.

## Add a page

1. Create `src/features/<name>/` with `queries.ts` (types plus a `get<Name>`
   dispatcher that calls `requireViewer()` and picks live or sample), `rows.ts`
   (a Zod row schema built from `bq.*` decoders), `bigquery.ts` (parameterized
   SQL through `warehouse.query`), `sample.ts` (deterministic fixtures in
   BigQuery's wire format), and `page.tsx` using `ReportPage`.
2. Add `src/app/(app)/<route>/page.tsx`: `export { default, metadata } from "@/features/<name>/page";`
3. Add one entry to `nav` in `app.config.ts`.
4. Wrap each data region in `<Suspense key={…the filters it reads…} fallback={<LoadingState …/>}>`
   and `<DataRegion>`, so it has loading, empty, error, and incompatible-schema
   states. A view with no date range (current state, such as inventory) passes
   `dates={false}` to `ReportPage`.
5. Add tests beside the view: `fixture-contract.test.ts` (sample shape and
   totals), `live-contract.test.ts` (the SQL, parameters, and truncation against
   the fake BigQuery; copy an example view's), and `<view>.e2e.ts` for interactions.
   Then `pnpm check`, and `pnpm test:e2e` after UI changes.

Copy `src/features/overview` (KPIs and charts), `paid-marketing` (dimension
filter and table), `creatives` (card grid), or `orders` (search, keyset pages,
detail drawer). See `docs/removing-the-example.md` to delete any of them.

## SQL and data

- SQL is written by developers, never built from browser input. Browser input
  becomes typed named parameters (`@store_id`), or picks from a fixed map in code.
- Fully qualified names come from `warehouse.table("<relation>")`; your own
  datasets in the warehouse project: `warehouse.table("customized_views.my_table")`.
- Aggregate in SQL. Every query has `maxRows`; check `result.truncated`. Totals
  are never computed from a truncated list.
- INT64 decodes to `bigint`, FLOAT64 to a finite number, DATE stays a string.
- Use the workspace reporting currency for money; confirm source alignment in
  `docs/data.md` before combining amounts. Set `app.config.ts` currency once.
  Keep NUMERIC exact, add with `sumDecimals`, format with `formatMoney`.
  Read each field's type: platform-reported revenue is FLOAT64. Never add across stores.
- Show "Queried at" and "Data freshness unknown"; never claim freshness from `MAX(date)`.

## UI

Two measures on different scales get two charts (one y-axis per chart).
Use the shadcn primitives in `components/ui` and the patterns in
`components/patterns`. Colors and fonts come only from `src/styles/tokens.css`;
use theme classes (`bg-card`, `text-muted-foreground`), not raw colors. Charts
use `--chart-1`…`--chart-8` in order, one y-axis, and keep the table view.
Comparisons: opt into `ReportPage comparisons` only when the feature queries
both periods. Reuse `lib/comparison.ts` and `patterns/kpi-delta.ts`; copy Overview.

## Route handlers and downloads

A `route.ts` handler (a CSV download, an API) calls `await requireViewer()`
first, like any data function. On a `WarehouseError`, return its `title` and
`remedy` with a 5xx status. Exports carry raw values (exact decimals, ISO
dates), not display formatting. This app is read-only: anything that writes or
acts for a person needs a real per-person authorization design first.

## Runtime constraints (Cloudflare Workers, tested)

- Runs on workerd via OpenNext with `nodejs_compat` (Workers Paid plan: a page
  needs more than the Free plan's 10 ms of CPU). WebCrypto, `fetch`, and `jose`
  work; there is no file system at runtime.
- Files in `public/` pass the viewer guard like pages (`run_worker_first` in
  `wrangler.jsonc`); only `/_next/static` skips the Worker.
- `src/middleware.ts` runs in the edge runtime: no Node-only APIs there.
- Configuration comes only from runtime variables, read per request through
  `readConfig()`. Never read configuration at module scope or build time.
- Use plain `<img>` for remote images (no `next/image` optimization on Workers);
  any https image host is allowed (`src/lib/security-headers.ts`).
- Pages are dynamic and private (`Cache-Control: private, no-store`); do not add
  shared caches of query results.

## Guides

- `docs/connect.md`: going live, configuration, deploying, lost secrets.
- `docs/data.md`: MCP setup, schemas, SQL rules, decoding, money, freshness.
- `docs/auth.md`: the shared password, Cloudflare Access, sign-in options.
- `docs/operations.md`: rotating secrets, quotas, errors and their remedies.
- `docs/removing-the-example.md`: deleting one view or all four.
- `docs/prompts.md`: starter prompts.

Publishing live data, production deploys, and destructive actions need the
person's explicit go-ahead. Never ask for a SourceMedium admin credential.

Run `pnpm check` before declaring done.
