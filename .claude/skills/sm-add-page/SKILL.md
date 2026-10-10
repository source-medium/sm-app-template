---
name: sm-add-page
description: Use when adding, replacing, or removing a page or view in this app - a new route, a navigation entry, a chart, table, KPI, or card grid backed by warehouse data.
---

Follow "Add a page" in `AGENTS.md`, and `docs/removing-the-example.md` when deleting a view:

1. A route file in `src/app/(app)/<route>/page.tsx` and one `nav` entry in `app.config.ts`.
2. A feature folder copied from the closest example view. For a simple page (a few
   KPIs, one chart, one table), start from `products`: the simplest view with KPI
   cards. Copy `overview` only for multi-measure daily summaries
   with grains, comparisons and CSV; it is about twice the size.
3. The patterns in `src/components/patterns` (KPI card, data table, card grid,
   ranked breakdown, cohort matrix) and the chart card in `src/components/charts`,
   each region inside `<Suspense>` and `<DataRegion timestamp={timeZone}>` for its
   four states.
4. Data work per the `sm-data` skill. Every SQL string that reads
   `warehouse.table(...)` keeps `sm_store_id = @store_id`; `pnpm check` fails without it.
5. Reuse `SelectFilter` for choices; it applies on change. Other report inputs use
   `form={REPORT_FILTER_FORM_ID}` from `lib/filters` and wait for Apply. See
   `docs/data.md#applying-report-filters`.
6. Pass the feature's parsed, shareable filters as `ReportPage agentFilters`; never raw
   `searchParams`, searches, or row IDs. Shared patterns expose prompt targets automatically.
   See `docs/prompts.md` for custom targets and named omissions.
7. Tests beside the view, as in `AGENTS.md` step 5: `fixture-contract.test.ts` (sample
   shape and totals), `live-contract.test.ts` (SQL, the `store_id` parameter and the
   other parameters, and truncation against the fake BigQuery), and `<view>.e2e.ts`
   for interactions.

Then run `pnpm check`, and `pnpm test:e2e` after UI changes.
