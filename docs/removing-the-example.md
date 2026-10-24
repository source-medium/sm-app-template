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

To remove all ten, repeat the steps for `overview`, `performance`, `stores`, `paid-marketing`,
`creatives`, `products`, `retention`, `orders`, `geography`, and `data`, and add your own page first. Keep the shell
(`src/components/shell`), the patterns (`src/components/patterns`,
`src/components/charts`), and `src/lib`; they are what new pages use.

Then point the guidance that names example views at your own pages:

- `AGENTS.md`: "Add a page" (the views to copy and the `live-contract.test.ts`
  to copy) and the **UI** section's "Copy Products..." line.
- `.agents/skills/sm-add-page/SKILL.md` (the example to start from), then run
  `pnpm skills:sync`.
- `src/lib/agent-prompt.ts` and `docs/prompts.md`: the new-page instruction to
  "copy the closest example view".
- `docs/data.md`: the relations table and the sections describing each example,
  such as comparisons copying Overview's `getOverviewReport`.
- `README.md`: the "Reports to make your own" table.

The store picker reads `dim_stores` (`src/lib/data/store-roster.server.ts`)
and falls back to `rpt_executive_summary_daily` only while that dimension is
missing, so it keeps working without Overview once the dimension exists.
If your app has no store filter, remove the `FilterBar` from your pages, or
replace `ReportPage` with your own frame.

Removing `stores` also removes the All stores picker option when its `scope: "all-stores"` navigation entry is removed. Remove its dedicated store-scope predicate from `scripts/lib/store-scope.ts`. The shared executive-summary fixtures support Overview and All stores without either feature importing the other.

Unused sample images live in `public/sample-creatives/`; delete them with
Creatives.

`performance` owns its business/platform queries, fixtures, tables and CSV route. Remove `src/app/(app)/performance` and its feature and navigation entry together. Summary date bounds and multi-channel controls are shared with Overview and remain useful without Performance.

`geography` owns its maps, provenance, export and tests. Removing it also removes the guarded Overview geography link when its nav entry is removed. `data` owns its source allowlist and example tabs. Shared metadata/binding helpers and AboutData do not import either feature. Keep the vendored metric fixture while any remaining example uses it.
