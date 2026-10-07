# Removing the example views

Each view lives in one folder and one route file, and nothing shared depends
on it. To remove a view, for example Creatives:

1. Delete `src/features/creatives/` (its unit and end-to-end tests go with it).
2. Delete `src/app/(app)/creatives/`.
3. Remove its entry from `nav` in `app.config.ts`, and its icon from the
   `lucide-react` import at the top of that file.
4. Run `pnpm check`.

The home page redirects to the first `nav` entry, so removing Overview just
makes the next entry the home page. Keep at least one entry, or replace
`src/app/(app)/page.tsx` with your own home page.

To remove all six, repeat the steps for `overview`, `paid-marketing`,
`creatives`, `products`, `retention`, and `orders`, and add your own page first. Keep the shell
(`src/components/shell`), the patterns (`src/components/patterns`,
`src/components/charts`), and `src/lib`; they are what new pages use. The
guides name the example folders as models to copy ("Add a page" in
`AGENTS.md`, `docs/data.md`, `docs/prompts.md`, and
`.agents/skills/sm-add-page`); point them at your own pages, then run
`pnpm skills:sync`.

The store picker reads `rpt_executive_summary_daily`
(`src/lib/data/store-roster.server.ts`), so it keeps working without Overview.
If your app has no store filter, remove the `FilterBar` from your pages, or
replace `ReportPage` with your own frame.

Unused sample images live in `public/sample-creatives/`; delete them with
Creatives.
