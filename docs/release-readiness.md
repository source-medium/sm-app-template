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
2. Follow the two Worker connections in `docs/cloud.md`. Request a small UI
   change, create its PR, and open the current commit's sample branch preview.
3. Request another change in the same conversation and verify the preview
   updates while production stays unchanged.
4. Approve publication, merge after CI passes, verify the production build,
   then revert the test change through another PR.

The two real cloud-agent walkthroughs and fresh-account Cloudflare Git import
remain **unverified**. Keep them separate from local and CLI deployment evidence.

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
