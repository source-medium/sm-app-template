# Release readiness

Status: 0.1.0 preview, suitable for public source distribution. The tested
path is local setup and Cloudflare Workers with a shared password. A fresh
Cloudflare account, real Access offboarding and self-service Apps provisioning
remain separate checks; do not advertise those journeys as verified. Publication, tags, deployments, IAM and account changes
require the maintainer's explicit authorization.

## Local release gates

Run these sequentially in a clean checkout with Node 24 and pnpm 10.34.5:

```sh
pnpm install --frozen-lockfile
pnpm exec playwright install chromium
pnpm check
pnpm test:e2e
pnpm exec playwright test --repeat-each=8
pnpm test:secrets
pnpm build:cloudflare
pnpm smoke:worker
```

Record the commit, dependency versions, commands and results in the release
notes. Recheck Linux and Windows CI for the final commit. Test removal of each
example and all examples after changes to shared shell or test infrastructure.
Scan tracked files and history for credentials, customer identifiers and
private URLs. Keep the MIT license and working support/security links.

After deployment-config changes, redeploy a sample Worker with the documented
`pnpm run deploy` command. Its existing password and plaintext `APP_STORE_ID`
must survive without command-line `--keep-vars` or resupplying either value;
verify allowed-store pages and exports and denied other-store requests.
Existing template copies need `keep_vars: true` in `wrangler.jsonc` before
their next deploy to preserve dashboard variables.

The hydration backport covers Next's stable and experimental DOM bundles,
including profiling. Its regression tests exercise the installed replay code.
When replacing it, verify the exact upstream compiled code and retain the
regression. A passing default build does not establish support for every
experimental Next feature.

## Verified release evidence (2026-10-06)

The release audit exercised all local gates above, 200 repeated browser tests
without a hydration error, and deletion of each example and all examples.
The repaired code passed Linux and Windows CI, production browser tests,
secret isolation and the eleven-mode Worker smoke suite. The approved demo
checkout passed diagnose and all five live browser tests. The actual Overview
SQL and decoders matched independently queried catalog revenue, orders and
ad spend exactly for the selected demo store and period.

A temporary deployment in SourceMedium's existing Cloudflare account passed
26 checks across the four views, password challenges, RSC/prefetch, action
POST, public assets, path/header probes and cache headers. Redeploying without
resupplying secrets retained the password. This does not establish the
fresh-account button flow or a real Access identity policy. The source and
all eight original commits were scanned; the only secret-scanner finding was
a synthetic test password. See [SECURITY.md](../SECURITY.md) for the dependency
review and the remaining development-only advisory.

## Cloud agent onboarding (2026-10-08)

Codex Cloud and Claude Code in the cloud share `scripts/setup-agent.mjs`,
the `sm-cloud` skill, and [one browser guide](cloud.md). Local validation in a
fresh checkout passed setup, all 84 browser tests, secret isolation, the
Cloudflare build, and the Worker smoke suite. Cold setup passed on macOS and
in a clean Debian 12 container with Node 24.7.0 and `NODE_ENV=production`,
including Linux OS libraries, browser downloads, and an actual Chromium launch.
Setup tests cover the local hook no-op, pinned installs, browser repair,
failed package/browser installs, failed launches after repair, and old Node.
The Linux rehearsal also caught a checkout-local `.pnpm-store` being treated
as source. Git and the quality checks now exclude this generated cache.
The final `pnpm check` passed on both macOS and Linux; all 84 browser tests
passed again on macOS after review. Windows CI was not rerun locally.

A temporary sample Worker in the existing Cloudflare account was deployed
with `pnpm run deploy --env preview`, then `pnpm run deploy:preview`. All six
views and the agent composer worked in a real browser with no page errors.
A second preview deployment updated the stable branch URL, left the previous
immutable URL unchanged, and did not promote the Worker's main deployment.
Wrangler's Cloudflare Builds name/branch environment variables were exercised.
The temporary Worker and its previews were deleted after validation.
This verifies the CLI path, not the Git integration or either cloud agent's
account screens.

Before advertising either cloud onboarding journey as fully verified, use a
fresh template copy in each provider and record this short walkthrough:

1. Connect GitHub and start the repository's cloud environment. Confirm setup
   finishes without local tools, warehouse credentials, or MCP login.
2. Follow the production Worker connection in `docs/cloud.md` and open the
   initial hosted sample URL without creating an empty PR.
3. Connect production data, the preview Worker and a demo-only Development credential in
   Previews Base. Request a small UI change in the same conversation and open the
   current commit's protected live-data branch preview. Verify its build id,
   actual data, Connection check and viewer/store guards while production stays
   unchanged. Also verify missing preview secrets give 503, never sample data.
4. Enter that same Development block privately in the agent's environment;
   confirm `pnpm diagnose` and a relevant live check work without issuing a
   third credential. Verify changing Base alone does not update an existing
   preview. Rehearse the preview-Worker reset in `docs/operations.md` when
   rotating Development; old immutable URLs must stop serving the app.
5. Approve publication, merge after CI passes, verify the production build
   against the resulting `main` commit, sign-in, Connection and the changed
   page, then revert the test change through another PR.

The full PR-to-production cloud-agent walkthroughs and fresh-account Cloudflare Git import
remain **unverified**. The initial cloud sessions below are partial evidence;
keep them separate from local and CLI deployment evidence.

The live-preview follow-up (2026-10-09) removes `--ignore-base-config` and
requires live configuration in both the preview Worker and its branch previews.
The configuration matrix passes in Node and workerd, including absent and
malformed settings and a missing viewer guard. `pnpm check`, all 94 browser
tests, the Cloudflare build and its preview-environment dry run passed. Demo
`pnpm diagnose` also passed with `APP_REQUIRE_LIVE=true`, with the existing
missing-`dim_stores` warning. Existing sample previews need their own live
settings or recreation; changing Base alone does not migrate them.

A temporary Worker in the existing demo account exercised this configuration
with generated, unregistered credentials. Missing preview settings returned 503. New previews inherited Base secrets; existing previews retained their
secrets after both a Base change and a code deployment. Anonymous requests,
RSC, protected assets, wrong passwords, and other-store requests were denied
on both branch and immutable URLs. Preview deployments left the parent
deployment unchanged. Updating a preview's own password changed its branch
URL while its old immutable URL still accepted the old password.

The retirement test found a Cloudflare limitation: branch deletion removed
the branch URL, but the old immutable URL continued serving the app; a deploy
with `preview_urls: false` did not immediately close it either. Deleting the
entire temporary Worker returned 404 on both URL forms. Recreating that Worker
under the same name did not restore the old immutable URL. The recovery steps
in `docs/operations.md` therefore reset the preview Worker when removing access.
During cleanup, Cloudflare again confirmed the Worker was absent while its
newest immutable URL still responded. That URL eventually returned 404 several
minutes later. Retirement is not verified until the serving URLs close; the
API's deletion response alone is insufficient.

With explicit permission to upload the existing demo block directly from
memory, a temporary password-protected Worker also passed the hosted live
Connection check and all six report pages in Chromium. No page rendered a
data error or browser exception. After a code redeploy without resupplying
secrets, the live dictionary opened on Orders and Overview. An initial
dictionary probe using `domcontentloaded` timed out; waiting for full page
load passed without an application change. Connection
reported the known missing-`dim_stores` warning. Version URLs were disabled
for this real-data check and verified to return 404; the branch-inheritance
exercise above used synthetic credentials. No real secret was printed or
copied into a temporary file. These tests do not verify Cloudflare's Git
integration, a fresh cloud-agent session, or issuance of a new Urchin key.
Cleanup removed the temporary key binding first and verified reports failed
closed with 503. The temporary Worker was then deleted; its live URL and the
tested immutable URLs returned 404. The public demo was not changed.

The Production/Development guidance is also aligned with Urchin's Apps page.
Its six handoff component tests and targeted lint passed. No app identity,
warehouse grant, or customer credential was created or changed in this rehearsal.

### Actual cloud sessions and hosted verifier (2026-10-09)

Both providers could select the existing GitHub repository without a new
connector grant. Sample-only sessions checked out `b954c857a7f0` and reported
passing `pnpm check` and local sample-page browser checks, clean tracked files,
and stopped servers. Neither ran the full PR, live preview, merge and production
loop, and neither received a warehouse credential.

- Claude's default Node 22.22.0 failed the locked `lint-staged` engine requirement.
  Node 24.21.0 resolved installation; browser downloads were then blocked by its
  network policy. The session used preinstalled Chromium only for a limited
  Overview/Orders smoke check. The repository now declares the correct minimum
  and its cloud hook selects Node 24 when needed, preserving it through
  `CLAUDE_ENV_FILE`. A fresh local checkout starting under actual Node 22.22.0
  passed this recovery, frozen installation and browser launch; a subsequent
  shell sourced the hook file and reported Node 24.21.0.
- Codex used Node 24.19.0 but needed writable workspace cache paths. Its bootstrap
  hit root-login failure while trying to install Linux libraries, plus HTTP 403
  on browser downloads. Its limited browser check used installed Chromium and
  fallback fonts. The setup draft remains unpublished. The bootstrap now
  downloads the locked browser first and requests OS libraries only if it
  still cannot launch. All 10 bootstrap tests passed in a Linux container,
  including the OS-library fallback. The guide makes cache paths and download
  hosts explicit. `pnpm dev` now pins port 3000; an occupied-port check visibly
  refused to start instead of selecting 3001. Next itself returned exit 0 on
  that failure, so readiness still requires the documented HTTP/browser check.

`pnpm test:hosted <origin> <commit>` reuses the existing live suite without a
local server or warehouse key. HTTP boundary tests cover a successful gate,
wrong build, missing guard, incorrect password, failed/malformed Connection
reports and sample mode. Config tests reject unsafe URLs and verify that no
dotenv file is loaded and credentials are confined to the target origin.
The actual command rejected a deliberately wrong commit on the public demo,
then rejected that demo's intentionally public sample mode at the guard check.
Those negative checks sent no warehouse credentials and changed no deployment.
Using the previously authorized temporary demo Worker and credential, the new
command passed build identity, guard, live Connection (one known store-metadata
warning), and all 12 live browser tests. The Worker ran application sources from
`b954c857a7f0`; the verifier ran from the updated working tree with no warehouse
key in its test process. The first live run caught an ambiguous Orders link
selector; an exact accessible name fixed it. One subsequent fresh deployment
failed the Connection gate before running any reports; its cause was not captured,
so it is not counted as a successful run. The final complete run passed in 44.4s.
Cleanup removed the key binding and deleted the temporary Worker; the serving
URL returned 404. Setting removal briefly still served HTTP 200, reinforcing
the need to verify effective retirement rather than trust API completion alone.
The public demo was unchanged. All 94 production browser tests and the final
`pnpm check` passed after the Playwright configuration changes.

The pre-commit review caught demo-data assumptions in the reused live suite:
empty channel rosters, empty campaign/product/cohort reports, and a date-less
first page caused false failures. The checks now accept each report's explicit
empty state, preserve errors as failures, and start date navigation from Orders.
A disposable browser fixture reproduced five failures before the fix; afterward
it passed with empty data and Retention first, and with only Retention remaining.
Injected query errors and missing report UI still failed. All 12 live tests
then passed against the demo warehouse (31.1s). No deployment was made for this review.

## Hosted connection checks (2026-10-08, unreleased follow-up)

The updated working tree passed `pnpm check`, a production build and all 88
browser tests, 32 repeated Connection browser checks, secret isolation (78
rendered responses), the Cloudflare build and the Worker smoke suite. Builds
ran in a separate checkout without the maintainer's environment files. The
new diagnostic endpoint passed same-origin and anonymous-guard checks in
both Node and workerd. Its safe report shares the CLI's warehouse checks.

The authorized demo checkout passed `pnpm diagnose` with its existing app
credential. It reported the expected store-ID fallback because `dim_stores`
is not yet published there. No credential or warehouse row was printed.
This checks connectivity, not metric accuracy or freshness.

Urchin's customer-admin Apps handoff is implemented separately and needs its
own migration, infrastructure and demo-only issuance rollout before it is
enabled. These starter checks do not prove newly issued Google credentials,
effective provider quotas, or the two fresh cloud-agent account journeys.

## Cloud-agent live debugging (2026-10-08, unreleased follow-up)

The optional Development credential path uses the existing app configuration
and commands, with current Codex and Claude environment instructions in
`docs/cloud.md#debug-with-live-data`. It does not issue a production credential
to an agent. Hosted previews now use their own protected live-data configuration;
the sample-only preview rehearsal above predates that change.

- Reproduced four sample-auth test failures with synthetic live values injected
  into the environment. After isolating the test environments, `pnpm check`
  passed with those values present, and all 88 sample/browser tests passed.
- The actual `diagnose` and `schema` CLI entry points consumed injected values
  against fake Google responses, without a dotenv file or credential output.
- Secret isolation scanned 38 build files and 78 responses; the Cloudflare
  build also passed with synthetic credentials injected in its environment.
  A deliberate `NEXT_PUBLIC_` copy of the injected key was rejected without
  printing it. The experiment ran only in the disposable clone and was removed.
- `pnpm test:live --grep 'renders live data'` passed all six views on the
  authorized demo checkout using its existing credential. Browser sign-in was
  automatic, with one worker and no traces, screenshots, videos or HTML report.
- Urchin's updated handoff passed its component tests, typecheck, lint and
  modularity checks. Production and Development use the same issuance code.

These checks verify the environment-variable contract locally. They do not
claim a fresh Codex/Claude cloud session or a newly issued Urchin key was tested.
The opt-in Urchin rollout and real cloud-account walkthroughs remain separate
release checks; no real key was copied to a cloud agent during this work.

## Onboarding review (2026-10-08, unreleased follow-up)

The onboarding guides now connect the production Worker before the preview
Worker, state the Workers Paid price, document the viewer password rule, and
describe the Apps page in the words urchin's page uses (checked against its
`customer-apps` component and issuance contract: variable names, block order,
password shape and button labels match). `pnpm preview` runs the doctor's
`--dev-vars` mode first. The claim it rests on was verified here: with a live
`.env.local` and no `.dev.vars`, the built Worker preview served public sample
data, so the preview reads `.dev.vars` alone. The preflight was exercised with
no file and with a broken file. `pnpm check` passed. The hosted account
journeys remain unverified as above.

## Host and onboarding checks beyond the tested path

On 2026-10-07, Claude Code 2.1.280 passed a real-client Read-tool permission
probe using a local scripted API, synthetic files, no login and no MCP servers.
The old rules allowed `.envrc`; the corrected rules denied 20 root and nested
`.env*` / `.dev.vars*` cases and allowed `.env.example` and ordinary files at
both depths. This tests the installed client's permission handling, not model
judgment or OS-level isolation. A synthetic filename regression runs in `pnpm check`.

On 2026-10-07, a self-led fresh-copy rehearsal of **Add a page** added a
Traffic view using the bundled schema, existing report patterns, a guarded
live query and matching sample rows. `pnpm check` and all 51 browser tests
passed. Its live query was tested against fake BigQuery, not the demo warehouse.
The exercise page is not included in the starter.

A separate fresh copy rehearsed **Check a number** against the recorded app
totals for demo store `democo`, 2026-09-08 through 2026-10-05. A fresh,
independently authenticated read-only BigQuery query matched revenue, summary
orders and ad spend exactly, with all channels included. The schema was
inspected first; queries used typed parameters and a bytes-billed limit.
`pnpm check` passed separately. This establishes numerical agreement, not the
reporting-currency ISO code or reliability across other agents and tenants.

| Gate                            | Evidence required before closing                                                                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SourceMedium Apps availability  | An admin can issue and replace an app-specific block through the published UI. Outside the starter release scope; keep planned-flow labels until it ships. Its absence does not block publishing the starter source.                                                                                                       |
| Fresh-account Cloudflare button | After publication, use a fresh account on Workers Paid. Copy the template, set runtime secrets, deploy, verify the password and Live data, and verify an anonymous request to a page, RSC request and public asset is denied. Confirm subsequent deployment retains secrets. Record versions and date without credentials. |
| Real Cloudflare Access          | Cover every hostname, verify allowed and denied identities and origin requests, then remove a test viewer and revoke sessions. Record actual offboarding behavior. Local JWT tests do not prove the edge policy.                                                                                                           |
| Vercel                          | Unverified and outside this preview's support claim. Before advertising support, deploy the same source with Basic auth and test configuration failures, public assets, RSC, headers and secret isolation. Remove the upstream spec's historical “Vercel smoke-tested” claim until evidence exists.                        |
| Connect my data prompt          | On a fresh copy, a maintainer enters a demo app block privately and follows the prompt with their agent. Record diagnose output, Live data on each view, and pnpm check. Do not use customer data.                                                                                                                         |
| Check a number prompt           | On a fresh copy, compare one demo-store period to an independently authorized metric result. Record exact store/date/filter definitions, exact decimals and count semantics, explanation of differences, and pnpm check separately.                                                                                        |
| Agent secret rules              | Verified with Claude Code 2.1.280 and synthetic files as described above. Recheck when changing patterns or supported clients; file-tool rules are not an OS sandbox.                                                                                                                                                      |
| Publication metadata            | Verify private vulnerability reporting is usable after publication; create the intended version tag and release only after the gates pass. Keep version headers aligned with the actual release.                                                                                                                           |

Use only SourceMedium's demo tenant for live template checks. Never copy an
existing secret into another checkout to make a test convenient. The already
approved demo checkout can run `pnpm diagnose` and `pnpm test:live`; those prove
connectivity and rendering, not the independent number comparison below.

## Reconcile Overview before claiming business equivalence

Overview preserves the catalog's all-channel sum. Its order count and revenue
ratio are labeled **Summary orders** and **Revenue per summary order**. They
must not be presented as valid-order count or valid-order AOV.

For the demo tenant, inspect the current schemas and metric definitions first.
Choose one explicit store and calendar date range, then obtain independently
reviewed results for:

1. Executive Summary net revenue, order count and ad spend, including every
   `sm_channel` and sub-channel row.
2. Those measures broken down by channel, identifying excluded, draft and
   exchanged categories that contribute to the total.
3. Valid orders from `obt_orders`, using the documented validity definition
   and matching local processed dates. Compare both count and net revenue.

Explain each difference from the grain, validity and date definitions. The
2026-10-06 demo audit independently compared the catalog totals with valid
orders for 2026-09-08 through 2026-10-05. Summary orders were about 2.02 times
the valid-order count; net revenue differed by less than 1%. The demo's
privacy masking scales numeric metric columns, including summary counts,
without multiplying order rows. Its generation code confirms this behavior.
Excluded, draft and exchanged channels alone do not explain the difference.

Do not divide counts by a fixed factor or change customer SQL to reconcile a
masked demo. Demo row counts are unsuitable as an independent expectation
for masked summary counts. Check the app's totals against the corresponding
catalog summary definitions, and record exact results privately without
publishing tenant data in fixtures.

## Other limits to keep explicit

- Ad image requests expose viewer network information to the image host. The
  privacy tradeoff and text-only alternative are in [data.md](data.md#creative-images).
  Expired-image fallback is tested; ad-platform URL lifetime is not guaranteed.
- Worker CPU measurements are observations from the demo, not a capacity
  guarantee. Re-measure after major runtime or view changes; Workers Paid is
  required. Do not run load tests against the public demo.
- Auth coverage is a development check. Runtime authorization remains
  mandatory, and new external consumers or per-person actions need a design
  and review beyond the shared viewer guards.
