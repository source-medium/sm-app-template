# Dashboard iteration 2 release evidence

Coordinated change `dashboard-experience-v2`, implemented on branch
`optimization-pop-caching` from template `a0cbe62`. The specification,
`smstack-dashboard-iteration-2-spec.md`, is kept out of the template and
belongs in `smstack/specs/` when the change is registered. No push,
deployment, infrastructure change or customer configuration change is part of
this work.

## What shipped, by stage

| Stage | Scope                                                                                                                                                                                                                                                                                               | State                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| S1    | Request ids and completed-job statistics on every query line; the query cache adapter (memory tier, single-flight, hard expiry); metadata split into schema, catalog and observation reads with their own policies; Refresh bypass in the Refresh action's own render; "Loaded at" provenance; docs | Implemented and tested                                                                                                                                                              |
| S2    | KV tier behind the `APP_QUERY_CACHE` binding, resolved through OpenNext's Cloudflare context; Connection page and `pnpm diagnose` name the tiers; `wrangler.jsonc` ships the binding commented with the create command                                                                              | Implemented; KV exercised on Miniflare in `tests/workerd`                                                                                                                           |
| S3    | Pending indicators on preset links, sidebar links and the Apply button (`useLinkStatus`, `useFormStatus`); a polite announcement beside the form; the `timing` Playwright project                                                                                                                   | Implemented and measured                                                                                                                                                            |
| S4    | `ComparisonPlan` with two slots, range intent, calendar alignment, `compare2` and `baseline=a                                                                                                                                                                                                       | b`; third window in `period-sql`; Overview, Products, Paid marketing, Geography and All stores show both slots on KPI cards and switch overlay and change columns without a request | Implemented and tested |
| S5    | Explore your data: searchable, categorised metric list folded over aliases, drawer with plain meaning first, View in report through `nav[].metrics`, Use in Vibe code; Fields and Data health kept and trimmed                                                                                      | Implemented and tested on the bundled catalog                                                                                                                                       |
| S6    | `isCurrency` checks real ISO 4217 codes; minor-unit and dollar-prefix tests; managed apps read an optional `reporting_currency` from the data API context, below `app.config.ts`                                                                                                                    | Consumer implemented; producer field pending in urchin                                                                                                                              |
| S7    | Gates, measurements, this record                                                                                                                                                                                                                                                                    | See below                                                                                                                                                                           |

## Decisions recorded

- **KV, not Durable Objects, for the shared cache tier.** One binding, no
  migrations, native expiry. Entries are immutable content-addressed snapshots
  with hard expiry, so eventual consistency cannot serve a wrong value, only a
  slightly older one within its policy. Single-flight is isolate-local, which is
  enough for a dashboard's viewer count. A coordinator waits for a measured
  stampede.
- **The cache lives in the template, below the viewer guard, in both modes.**
  Managed apps load `/context` on every request before any cache read, so a
  paused or revoked app reaches `refusedWarehouse` first. The key names the
  deployment environment, app, project, datasets, SQL, typed parameters and
  bounds, never a viewer or token.
- **Intent from the range, not a new URL parameter.** `rangeIntent()` reads
  what the applied range is against the store's date; `compare` keeps its legacy
  values and `compare=off` still turns everything off.
- **Both slots travel with the page.** Each report renders its overlay and
  tables once per slot inside `ActiveBaseline`; the caption's switch mounts the
  other variant and updates the URL through native history. Zero requests, no
  client data layer.
- **Explore is a list with a drawer, not a card grid**, and its categories are
  the catalog's own `metric_category`, falling back to the model for a catalog
  that predates the column. No app-side taxonomy.
- **No app-side currency detection.** The app labels money only from
  `app.config.ts` or from the currency the data source vouches for. Mixed
  currencies cannot be observed in the summary and advertising tables, so
  suppression stays a producer question.

## Producer follow-ups (outside this repository)

- `reporting_queries/python_scripts/export_dashboard_metrics.py`: add
  `metric_category`, `is_abbreviation`, `preferred_metric_name`,
  `abbreviations_list` and `semantic_model_name` to the exported subset so the
  bundled sample catalog groups like a live one. The template reader already
  accepts them as optional columns; the vendored `dashboard-metrics-v1` fixture
  is unchanged here so the smstack contract pair stays byte-identical.
- `urchin` managed data API: publish `warehouse.reporting_currency` (nullable)
  in the `/context` response and the `managed-app-v1` schema and examples. The
  template reads it when present and tolerates its absence; the vendored
  contract here is unchanged until the producer lands it.
- Create the `APP_QUERY_CACHE` KV namespaces for the demo and managed deploys
  (`pnpm exec wrangler kv namespace create APP_QUERY_CACHE`, once per Worker)
  and paste the ids into `wrangler.jsonc`. Without them the cache is memory only.

## Verification

Commands run on this checkout (Node, macOS). "Not run" is stated where it applies.

- `pnpm check` (format, lint, types, auth and store-scope coverage, skill
  copies, all unit, component, contract and invariant tests in Node and
  workerd): passed; see the final run recorded below.
- `pnpm build`: passed.
- `pnpm build` then `SM_TIMING=1 pnpm test:browser` (sample, phone, protected, fixed-store and timing projects): 176 passed, 0 failed, on the final build. Includes the new checks: two comparison rows on every Overview headline and a zero-request overlay switch; a duplicate second slot shown once; calendar comparisons across leap years keeping their changes; the Explore page's three-interaction task, alias search, Vibe code hand-off and honest health states; the axe scans with the overlay-safe Apply button.
- `pnpm build:cloudflare`: passed; the Worker built without local environment
  values. `pnpm smoke:worker`: passed in workerd, including the Explore page and
  its fixed-store guard (the smoke expectation now looks for "Data health").
- After merging `origin/main` (`8c31777`): `pnpm build:cloudflare` then
  `pnpm check:deploy` passed every stage (check, secret isolation, 171 browser
  tests, Worker smoke).
- `pnpm diagnose` and `pnpm test:live` against the `sm-democo` demo warehouse:
  all checks passed, 21 of 21 live tests, so every report's three-window SQL
  runs on BigQuery. A hands-on pass on a live `next start` server confirmed:
  each Overview KPI card shows both rows; the switch changes the overlay with
  no request; a full month compares with the previous month and last year's
  month, and the headline names "the previous month"; Geography, Products,
  Paid marketing and All stores show their per-slot change columns; Products
  gainers show one list against the first comparison with no switch; Explore
  lists 177 live metrics grouped by the catalog's categories; the JSON export
  carries `cachedResultsQueriedAt`; the Connection check names the memory tier.
  It also found raw category keys (`period_comparison`) on the chips; they are
  now shown in words.
- Server logs from that pass, per request: first Overview load 8 warehouse jobs;
  reload 8 cache hits and no jobs; Refresh one request with 8 `bypass` jobs;
  the same store's full month 4 hits (store list, metadata) and 4 jobs. No
  warning or error lines.
- Not run: a protected preview timing run and the KV tier on a deployed Worker
  (no namespace exists yet); KV is exercised on Miniflare only.

### Cache gates (automated)

`tests/invariants/query-cache.test.ts` (Node and workerd) and
`tests/workerd/query-cache-kv.test.ts` (Miniflare KV): a warm repeat runs zero
jobs; a concurrent identical burst runs one; the key separates stores, SQL,
parameters, bounds, apps and environments; entries expire at their policy;
the Refresh action's own render bypasses and replaces entries, and the next
request reads them again; errors are never stored; results over 256 KiB are served but not stored; a failing KV
tier logs a warning and the warehouse answers, including a write that finishes
under `waitUntil` after the response; a run other requests may join is kept
alive with `waitUntil`; a fixed-store deployment checks
the store parameter before any cache read; Orders never sets a policy
(`tests/static/guardrails.test.ts`). `tests/invariants/report-metadata.test.ts`
asserts three parallel jobs on a cold isolate and none when warm.

### Timing (sample fixture, local, five pages, cold then warm then a date change)

Measured by `e2e/timing.spec.ts` on this machine; local evidence, not production
percentiles. Milliseconds from navigation start.

| Page            | Cold shell | Cold usable | Warm usable | Date change usable |  Layout shift |
| --------------- | ---------: | ----------: | ----------: | -----------------: | ------------: |
| /overview       |        157 |         447 |         185 |                155 | 0.015 / 0 / 0 |
| /paid-marketing |        176 |         449 |         166 |                164 | 0.009 / 0 / 0 |
| /products       |        221 |         280 |         119 |                110 |     0 / 0 / 0 |
| /geography      |        226 |         458 |         132 |                108 |  0.01 / 0 / 0 |
| /data           |         93 |         144 |          70 |                 62 | 0.042 / 0 / 0 |

Every page stayed under the 0.1 layout-shift budget; sample mode runs no
warehouse jobs, so these numbers measure rendering and streaming, not the cache.
The cache's effect on live latency needs the preview run above.

## Review before commit

An independent review of the full diff found, and this commit fixes:

- Explore picked one of two definitions published under one name; conflicting
  names are now listed for source review and never shown, as before, and an
  alias whose primary is not loaded stays findable.
- Products ranked gainers and decliners against the first comparison but
  labelled the second slot's variant with the second baseline; those rankings
  now show one list against the first comparison and no slot switch.
- Ranked lists (products, ad spend) were padded with items active only in a
  comparison period, which the default last-year slot made common; only items
  with a selected-period value are ranked.
- The Overview headline worded every baseline as "the previous N days"; it now
  names the slot ("the previous month", "the same weekday last week").
- Refresh rendered the page twice (the action's response, then a router
  refresh) and the first render read the cache; it is now one action whose
  response re-renders with the cache bypassed, and the app sets no cookie.
- KV write failures under `waitUntil` were never logged; a shared in-flight
  run could be cancelled with the request that started it.
- The Overview JSON export now states the origin time of cached results.
- Duplicated per-slot code was consolidated (`slotDeltas`, `slotColumn`,
  `planParams`, `BaselineRanges`), and code the change made obsolete was
  removed (`parseComparison`, `comparisonRange`, the Data page `PAGE_SIZE`).

## Rollback

The change is one commit on its branch; reverting it restores the previous release. The cache can be disabled without touching
reports by removing the `cache` field from a query or by not creating the KV
namespace (memory only). Comparison URLs are backward compatible: an old
`compare=` link still parses, with a second slot added by default, but
`previous` now follows the range (a single day compares with the same weekday a
week earlier, a full month with the previous month), so such links can show a
different baseline than before.
`tab=metrics` still opens Explore.
