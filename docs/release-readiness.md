# Release readiness

Status: unreleased 0.1.0 preview. Local tests and a demo deployment do not prove
fresh-account onboarding. The template can be shared as a preview with these
limits; do not label it a supported self-service v1 until the applicable gates
below have evidence. Publication, tags, deployments, IAM and account changes
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

The hydration backport covers Next's stable and experimental DOM bundles,
including profiling. Its regression tests exercise the installed replay code.
When replacing it, verify the exact upstream compiled code and retain the
regression. A passing default build does not establish support for every
experimental Next feature.

## Open host and onboarding gates

| Gate                            | Evidence required before closing                                                                                                                                                                                                                                                                                           |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| SourceMedium Apps availability  | An admin can issue and replace an app-specific block through the published UI. Outside the starter release scope; keep planned-flow labels until it ships. Its absence does not block publishing the starter source.                                                                                                       |
| Fresh-account Cloudflare button | After publication, use a fresh account on Workers Paid. Copy the template, set runtime secrets, deploy, verify the password and Live data, and verify an anonymous request to a page, RSC request and public asset is denied. Confirm subsequent deployment retains secrets. Record versions and date without credentials. |
| Real Cloudflare Access          | Cover every hostname, verify allowed and denied identities and origin requests, then remove a test viewer and revoke sessions. Record actual offboarding behavior. Local JWT tests do not prove the edge policy.                                                                                                           |
| Vercel                          | Unverified and outside this preview's support claim. Before advertising support, deploy the same source with Basic auth and test configuration failures, public assets, RSC, headers and secret isolation. Remove the upstream spec's historical “Vercel smoke-tested” claim until evidence exists.                        |
| Connect my data prompt          | On a fresh copy, a maintainer enters a demo app block privately and follows the prompt with their agent. Record diagnose output, Live data on each view, and pnpm check. Do not use customer data.                                                                                                                         |
| Check a number prompt           | On a fresh copy, compare one demo-store period to an independently authorized metric result. Record exact store/date/filter definitions, exact decimals and count semantics, explanation of differences, and pnpm check separately.                                                                                        |
| Agent secret rules              | With synthetic files only, verify the installed Claude Code refuses `.env`, `.env.staging`, `.env.preview`, `.env.local.bak`, nested variants and `.dev.vars.*`, while `.env.example` stays readable. File-tool permission rules are not an OS sandbox.                                                                    |
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
