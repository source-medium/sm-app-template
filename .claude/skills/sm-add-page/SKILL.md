---
name: sm-add-page
description: Use when adding, replacing, or removing a page or view in this app - a new route, a navigation entry, a chart, table, KPI, or card grid backed by warehouse data.
---

Follow "Add a page" in `AGENTS.md`, and `docs/removing-the-example.md` when deleting a view:

1. A route file in `src/app/(app)/<route>/page.tsx` and one `nav` entry in `app.config.ts`.
2. A feature folder copied from the closest example view.
3. The patterns in `src/components/patterns` (KPI card, chart card, data table,
   card grid, cohort matrix), each region inside `<Suspense>` and `<DataRegion>` for its four
   states.
4. Data work per the `sm-data` skill.
5. Reuse `SelectFilter` for choices. Other report inputs use `form={REPORT_FILTER_FORM_ID}`
   from `lib/filters`; Apply submits all drafts together. See `docs/data.md#applying-report-filters`.

6. Pass the feature's parsed, shareable filters as `ReportPage agentFilters`; never raw
   `searchParams`, searches, or row IDs. Shared patterns expose prompt targets automatically.
   See `docs/prompts.md` for custom targets and named omissions.

Then run `pnpm check`.
