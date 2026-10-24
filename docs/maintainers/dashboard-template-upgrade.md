# Dashboard template upgrade release evidence

Coordinated change `dashboard-template-upgrade`, based on template
`9424b1fd9a1a24da28f01bb299001d58780bcdd1`. Implementation is complete; release validation and its external limitations
are recorded below. No deployment, commit, push or customer-data mutation is part of
this change. The component builds without smstack or sibling checkouts.

## Review stages

1. Canonical producer snapshots and compatibility tests; dataset/store metadata
   identity, evidence separation and bounded optional metadata.
2. Shared report hierarchy, four primary Overview KPIs, loaded-series switching,
   same-source changes, number inspection and Data & definitions.
3. Performance-first Creatives, aggregate thresholds, bounded comparison and
   explicit context transitions.
4. Valid-order shipping Geography, licensed local maps, explicit order date bases,
   scoped exports and lazy attribution evidence.
5. Product/campaign/cohort/store refinements, full validation and screenshots.

Canonical definitions remain in reporting_queries. The vendored fixture is an
explicit review baseline; drift creates findings without executing metadata SQL or
changing report calculations. Summary orders are not valid-order counts, summary
revenue per order is report-specific, and platform attribution is not store ROAS.

## Confirmed evidence

- Original template `pnpm check`: passed before implementation, 297.8 seconds.
- Final coordinated app `pnpm check`: passed in 48.9 seconds with `VITEST_MAX_WORKERS=2`,
  including format, lint, types, auth/store coverage, setup/skill checks and all
  tests, including the final browser-driven presentation and live SQL fixes.
  The final repeat after protected-live test corrections and currency restoration
  passed in 48.6 seconds. The restored generic production/Cloudflare build passed.
- Production `pnpm build`: passed, including TypeScript and dynamic route output.
- `pnpm build:cloudflare`: passed; local environment values were scrubbed from
  the Worker output by the existing build gate. `pnpm smoke:worker` passed in
  workerd, including new Geography/Data pages, exports and fixed-store tampering.
- Full coordinated `pnpm test:e2e`: 168 passed in 1.1 minutes, including
  material-filter disclosure/back, copied trend selection/default scope and no
  metadata prefetch. The earlier serial run passed 167 tests before the final
  regression was added. No assertion timeout or numerical tolerance was increased.
- The two-worker repeat had 166 passes and one unchanged Retention axe timeout;
  that case passed in isolation (7.7s) and in the full serial run (1.7s).
- Focused new data/format/export/product/contribution/reconciliation tests: 23
  passed; additional map/export/date-boundary/format tests: 8 passed.
- Producer `just ci-tooling`: 1,291 passed, two opt-in BigQuery checks skipped.
  The two new fixture tests match current canonical YAML/macros and cover
  summary/valid/platform scope. `just ci-duckdb` completed on retry, including
  572 local-engine tests, synthetic smoke, both graph parses, declaration/format
  checks, model compilation and compatibility tests. Terraform validation passed.
- Producer `just ci-network`: passed after the targeted lockfile update from
  setuptools 84.0.0 to 84.2.1 fixed advisory `GHSA-xmj3-9gf7-h52w`.
  `uv lock --check` passed. No audit exclusion or unrelated dependency update was made.
- Documentation `just ci`, generated-table `--check`, column accuracy and
  `just ci-network`: passed. Task-local verified Lychee 0.24.2 reported 601 unique
  links, zero errors and zero timeouts, using the existing exclusions.
- New `dashboard-metrics-v1` producer/consumer fixture: byte-identical. Full
  working-tree smstack contract check: 47 matches, zero drift or missing files,
  five outside-workspace pairs. The stale `smetl-landed-tables-v1` consumer fixture
  was refreshed byte-for-byte from its existing canonical producer, adding 30
  published tables without changing smetl or its pin.
- Root `just check`: final repeat passed 98 tool tests in 276.490 seconds and
  validated the manifest/operations. Overall exited 2 because the
  new submodule is staged but not in parent HEAD. User required no commits, so the
  recorded-pin gate remains unresolved rather than bypassed.

## Coverage map

The final gate executes these tests through the component's normal commands.
Fixtures prove implementation and compatibility behavior, not live numerical truth.

| Requested behavior                                                                                                          | Reviewable coverage                                                                                                                 |
| --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Existing totals, ratios, CSV, exact decimals, null/zero, unsafe integers, fractional credit                                 | Existing feature fixture/live contracts, `tests/unit/dashboard-format.test.ts`, Overview JSON parity and contribution tests         |
| Canonical identity, population, time, filters, dependencies, cycles and drift                                               | Feature `metrics.test.ts`, `src/lib/metric-binding.test.ts`, producer `test_dashboard_metrics_contract.py`                          |
| Dataset/store/global identity, repeated/conflicting statistics, old optional fields, denied/wrong types, no false freshness | `tests/invariants/report-metadata.test.ts`, dictionary invariants, Orders metadata failure isolation                                |
| Geographic totals/remainder, negative/unknown/unmapped destinations, country-context normalization, date boundaries         | Geography fixture/live/map/export tests and `src/lib/order-scope.test.ts`                                                           |
| Context transitions, explicit date bases, thresholds after aggregation, compound identities, legacy views, cohort maturity  | Drill-down tests; Orders/Creatives/Retention feature contracts and browser tests                                                    |
| Attribution winner/context/truncation, privacy, auth/store scope, raw JSON context, custom/removable examples               | Orders attribution/live tests, auth and dictionary invariants, prompt/privacy/static checks, fixed-store/protected browser projects |
| Light/dark, mobile/desktop, loading/error/empty/partial, keyboard/focus, chart/table, delayed hydration, lazy maps          | Shared app/phone browser tests, feature browser tests, WCAG 2.2 axe checks and sample screenshots                                   |
| Metadata query budget, Overview loaded-series switching, bundle size, Cloudflare runtime                                    | Metadata job-count tests, zero-network Overview browser assertion, map-network test, bundle artifact, Workers build                 |

## Live limitations and required reconciliation

Authorized SourceMedium Demo schema inspection verified the fields used for
summary contributions, ad performance, order geography/date bases, product
identity/costs and safe attribution evidence. Initial 13 summary/ad definitions
matched their reviewed calculations, filters, dependencies, model/time fields and
formats. The two canonical valid-order definitions were also inspected.

Initial account-context discovery selected an empty QA store for the bounded
period 2026-09-01 through 2026-09-28. MCP request IDs:
`f1c24345-1471-49f3-ae11-2d304614cbb4` (summary),
`238a55de-7339-4ec6-bfa2-896e3fa93e60` (orders). After the user identified
`sm-democo`, the published `dim_stores` roster returned DemoCo instead of that
account-context store (`5133b87d-74fa-4f57-87fd-e0ca2ffb90bc`). The earlier empty
results do not describe DemoCo. Account/connector health was not promoted to
published-store freshness evidence.

Bounded live checks for DemoCo and that same September period passed:

- Overview developer-authored SQL returned 28 daily rows. Its raw revenue,
  summary-order and spend totals match the independent catalog-metric query;
  daily revenue and all channel/sub-channel contributions reconcile exactly.
- Geography's processed-fallback, created, US and US/California scopes executed
  successfully. Every group and daily trend reconciles to the independent
  full-population total in its query. Untruncated result sizes: 45, 45, 89 and 30.
- Valid-order revenue/count match independent processed and created references.
  The MCP compiler uses processed-only; a separate scoped read found zero
  fallback orders in this period. This proves equivalence for this period only,
  not that the compiler generally implements the published COALESCE expression.
- BigQuery initially rejected untyped NULLs in the new aggregate UNION branches.
  Explicit STRING/DATE casts corrected the cause; both live queries then passed,
  and their SQL contracts now protect those types.

Live request IDs: Overview reference `a0bbbd1d-63b6-4b7d-a601-b3b409d6039a`,
implemented query `53f74221-3d0c-4993-9276-08e6e6df8e5e`; processed reference
`cc6b1b30-4b53-4759-a42b-ebcd3ce4c8c3`, created reference
`42320002-7a3b-441c-b1d2-3c2c6cb0c219`, fallback audit
`e92020fb-949b-4fb6-9a0c-ad9e84f01f4d`; Geography queries
`70b29c67-df3a-4fb0-bd34-0365ac1d9f67`, `9daf1560-0b16-40e7-b5f7-0626061642f9`,
`5c4c869b-2c74-4e62-8f74-01e53741d815`, `555710fe-fb4b-42c0-a9a3-9e942b380903`.
These developer MCP executions used captured app SQL with reviewed constant
parameters, then the app's real decoders and exact-arithmetic reconciliation.
Private raw evidence and the two passing replay checks are retained locally.
MCP is not imported by, or required to run, the application.

Protected app export checks now pass. The existing original app checkout's
`pnpm diagnose` verified a live, password-protected DemoCo connection; its
`pnpm schema obt_orders` verified 177 published columns. The upgraded Playwright
configuration consumed that configuration through its existing environment loader,
without inspecting or copying secret files. The user explicitly verified USD.
The existing per-store currency customization was set temporarily for this local
check; no currency was inferred from nominal store or order metadata.

Five private checks passed: three actual protected CSV exports, separately measured
shell/usable-data timing, and Geography to created-date valid Orders to lazy
attribution evidence. The real unmodified Overview, Geography processed-fallback
and Geography created CSVs each passed `pnpm reconcile` against their independent
references with zero tolerance. Private references, CSVs, reconciliation reports
and logs remain under `.sm/dashboard-template-upgrade/protected-exports/`, with
live traces, screenshots and video disabled. These matches cover the recorded
period, definitions and population; they do not establish pipeline freshness.

The full protected live suite passed all 21 tests in 51.5 seconds. Its initial run
passed 19 and exposed two stale test assumptions: the Creatives control retains
its existing Ad channel label, and compact KPIs require comparing their full-value
attribute with store rows. The corrected assertions retain exact equality and
avoid logging live amounts. Tests also explicitly open Overview's summary
disclosure after filter changes and respect Data & definitions' intentionally
separate metadata timestamp behavior. No product calculation or deadline changed.
The temporary DemoCo USD customization was restored byte-for-byte to the generic
template configuration before the final build; the original live checkout's
source and secret files were not modified.

Trustworthy delivery freshness, completeness watermarks and named quality-check
results are not published in the inspected app-accessible contract. The UI ships
honest unknown states. An upstream extension must name its owning producer, actual
store/population grain, assessment time, successful delivery and policy before it
can replace those states. A generic data-health table is not introduced.

Concrete upstream dependency: `smdelivery` owns the customer dictionary publication
and would need to publish verified delivery evidence at the actual store/dataset/
relation scope before this app can report delivery freshness. A future additive
contract must distinguish assessment time, successful delivery, source policy and
a nullable completeness watermark with its date basis. It must preserve unknown
values and carried observations. Existing ingestion or orchestration completion
records alone do not satisfy this dependency. No internal control-plane credential
or new health table is required by this release; the owning producers must approve
any later publication and its compatibility fixtures.

Created-date Geography and Orders deliberately have no processed-date pruning;
no safe superset was established. Existing byte and deadline limits remain in
force. If authorized live scans exceed them, the proposed upstream dependency is
a `reporting_queries` daily valid-order shipping aggregate, published through the
existing delivery workflow. Its reviewed grain would include actual store, local
report date, explicit created/canonical-processed basis, sales channel, shipping
country and country-scoped region. It would publish exact net-revenue sums,
non-null stable-order-key counts and record counts, including unknown locations.
The two date bases must never be summed together. Independent source totals and
consumer compatibility fixtures would be required before switching the app.
This is a proposal, not an existing relation or a claim of live cost validation.

## Performance and visual evidence

Production manifest comparison, gzip level 9, counts unique chunks
referenced by shell/sidebar client modules including bundled dependencies:
baseline 207,283 bytes, upgrade 209,748 bytes, delta 2,465 bytes, below 30 KiB.
The production map closure is 55,162 bytes
gzip including geometry and both interaction chunks, below 200 KiB. Browser
coverage verifies non-Geography isolation and mobile loading only after Show map.

Five alternating fresh Chromium contexts per production build measured Overview
shell, visible business data and hydrated comparison controls independently. Median local sample
measurements in milliseconds (cold first run included):

| Measurement                 | Baseline | Upgrade |
| --------------------------- | -------: | ------: |
| Report shell visible        |       74 |      91 |
| First KPI visible           |      399 |     431 |
| Comparison control hydrated |      482 |     443 |

These are local sample measurements on a busy machine, with zero warehouse jobs,
not production latency claims. Raw measurements are retained in the local release
artifact directory. A separate protected live observation measured shell at 744 ms
and usable KPI data at 1,629 ms. Existing server query logs independently measured
Overview at 542/1,294 ms (one cache hit), Geography at 937–1,045 ms (three uncached
jobs), and lazy attribution at 773 ms. Five report requests each used one metadata
schema job and one batched metadata job. This is bounded local evidence on a busy
machine, not a production latency percentile or a claim based on MCP slot time.

Sixteen sample-only screenshots cover Overview, Creatives, Geography and Data &
definitions at 320px/1280px in light/dark themes. Full-browser screenshots also
cover the remaining example reports. Hydrated 320px reflow passed, including the
1280px-at-400%-equivalent CSS viewport. A delayed-hydration check identified a
fixed initial chart width overflow; the chart now waits for actual measurement
while CSS reserves its height, with a regression test. The repeated delayed-hydration
measurement recorded zero overflow frames. Native browser 400% zoom
and VoiceOver are not claimed by the equivalent-viewport and ARIA/keyboard tests.
Native desktop checks remain unrun: browser-tab automation works, but native
Chrome, Safari and System Settings return no accessible window. Read-only OS
session status confirms the desktop is locked. Browser security policy also
rejects internal settings-page access; neither boundary was bypassed. A real
browser Enter-key interaction successfully opened the metric definition and
exposed its structured scope and limitations in the accessibility tree. This is
keyboard/accessibility-tree evidence, not a VoiceOver or native zoom result.

Cloudflare build/runtime and final app checks passed. Coordinated record
`20261024T024231066278Z` records all three component CI lanes passing, but its
upstream-mode contract gate still fails on two `dbt-jobs-v1` pairs. Upstream
smorchestrator `197951fde7d2` and urchin `13fc0aa9d9d1` have the newer demo-job
ownership contract; this producer worktree remains at `d79b93115d7c`. The matching
producer change is already merged upstream at `d80d272fc858`. Integrating it is
separate from the dashboard contract. No upstream merge was performed under the
user's no-merge instruction, and no orchestration policy was copied into this
change merely to pass CI.
The complete working-tree check still passes all 47 pairs. Root `just check` also
retains its intentionally uncommitted registration limitation. Neither failed
gate is represented as passing.

Local logs, sample screenshots, raw timings and bundle measurements are retained
under `.sm/dashboard-template-upgrade/` (ignored, never shipped). The reproducible
bundle measurement script accepts the upgrade and baseline checkout paths. The
same command must follow any further shared-client or map changes.

## URL and query behavior

Overview's loaded series and Show all trends update native history. The feature
passes only `metric` and `show_trends` through ReportPage's
`clientPresentationParams`, so copied links include those choices while retaining
server-resolved store/date defaults. Business filters remain server-applied.
Report forms and links do not speculatively prefetch warehouse-backed destinations.
Sidebar links carry the shared store, dates and a supported comparison only; a
new report starts fresh, without a confirmation step. Supporting detail links retain compatible scope.

## Rollback and preservation

The change is local and uncommitted. Review or revert feature/UI edits together
with the vendored fixture; existing CSV columns and numerical definitions were
preserved. Do not replace customer app.config customizations. Existing component
pins and unrelated dirty workspaces stay untouched. Retain coordinated worktrees
until explicitly authorized commits and a verified merge; no merge cleanup is
currently appropriate. Task-created sample browser tabs were closed and their
local server stopped. Protected live servers ran under `devserver` and exited
with their checks. Private evidence remains in the ignored app artifact directory.

## Independent review changes, 2026-10-23

A second reviewer verified the uncommitted change against the brief and applied
these corrections in place (none committed):

- `src/lib/metric-binding.ts`: descriptions are shown, not compared; compared
  definition text is whitespace-normalized. A live customer catalog folds the
  MER description's YAML line break, which produced a false drift finding.
- `src/components/shell/app-sidebar.tsx`: direct links again; no confirmation
  sheet. Shared store/dates/comparison carry over, report-specific filters do
  not, and Back restores them (`overview.e2e.ts`).
- `src/components/shell/data-status.tsx`: the strip leads with each source's
  published metadata date or availability, then one "not published" sentence.
- `src/features/stores/comparison-table.tsx`: constant "Data evidence" column
  replaced by a footnote.
- `src/features/creatives/page.tsx`, `card-grid.tsx`: duplicate definitions
  block removed; card disclosure labeled "About platform ROAS".
- `src/features/geography/page.tsx`: coverage shows "Not applicable" for
  countries without bundled region boundaries.
- `src/features/orders/page.tsx`: date-basis labels without "legacy".
- `scripts/smoke-worker.ts`: original encoded-delimiter check restored.
- sourcemedium-docs `help-center/core-concepts/data-health.mdx`: original page
  restored plus a "What the dictionary flags establish" section.

### Follow-up, 2026-10-23 (all review concerns)

- Partition pruning: the catalog's processed-with-created-fallback basis is now
  written as `(processed within window) OR (processed IS NULL AND created within
window)` instead of `COALESCE(...)`, in Orders (list, roster, detail) and
  Geography (`src/lib/order-scope.ts`). This selects exactly the same rows and
  lets BigQuery prune the processed partition to the window plus its NULL
  partition, so no superset proof is needed. Created-date scopes are unchanged
  and still do not prune; the upstream aggregate proposal remains for them.
  Contract tests assert the new form and that created scopes carry no processed bound.
- Producer base: the reporting_queries worktree was fast-forwarded to upstream
  `d80d272fc` (two commits; no local commits existed). The landed-tables fixture
  is now upstream's byte-identical copy, and the lockfile is upstream's with the
  targeted setuptools 84.2.1 bump reapplied (`uv lock --check` passes). This
  resolves the two `dbt-jobs-v1` drifts in the coordinated check.
- Accessibility: `.sm/dashboard-template-upgrade/visual/a11y/` holds 400% zoom
  captures (Chromium device-metrics emulation of a 1280px window at 400%, that is
  a 320 CSS px layout at device scale 4) with zero horizontal overflow and no
  scrolling tables on Overview, Geography, Orders, Creatives and Data, plus
  accessibility-tree snapshots for the Overview KPI definitions and status strip,
  the Geography map and table, the Orders attribution drawer and a Creatives card,
  and a keyboard run that tabs to a map region link and follows it. VoiceOver was
  not run: it is a native assistive technology and must be exercised by a person.
  Steps: VO-On, open /geography, VO-Right through the map group to a region link,
  VO-Space, confirm the Orders page announces the applied date basis.
- Root `just check` still needs the staged registration committed; the tool
  compares recorded HEAD gitlinks whenever the parent has a commit. The complete
  `just contracts --working-tree` run reports the two dashboard pairs against the
  root's old submodule checkouts, which is expected before the pins move; the
  coordinated `just change check` uses the worktrees.
- Docs `just ci-network` was run with a task-local lychee 0.24.2 whose archive
  matched the publisher's SHA-256 (`c9d3740e…31c4977`): 602 unique links, zero
  errors or timeouts, existing exclusions unchanged. No global install.
- Coordinated record `.ci-results/20261024T042143252872Z.json`: reporting_queries
  (`d80d272fc858`), sourcemedium-docs and sm-app-template lanes all passed, with
  168 browser tests and 47 contract pairs, zero drift. An earlier run of the
  same tree had one load-related failure in the pre-existing Orders channel test
  (`orders.e2e.ts:50`, select read before the streamed roster replaced its
  placeholder); it passed three isolated reruns and the full rerun unchanged.
