---
name: sm-cloud
description: Set up Cloudflare hosting and automatic deployments, prepare a hosted preview, or publish an approved change from a local or cloud coding agent.
---

# Cloud setup and iteration

Read `AGENTS.md`, `docs/setup.md` and `docs/cloud.md`. Use `pnpm app:setup plan` to preserve known sign-in, live intent and actual target URLs in the customer copy; use `pnpm app:setup status` to observe current readiness. Default to Cloudflare Artifacts for source
and Workers Builds for checks, branch previews and automatic main deployments.
GitHub is optional source hosting for an existing repository or browser agent
that needs it; GitHub Actions and PRs are not required for the Artifacts path.
Use the person's existing app and environment; do not migrate its source host
or create another template copy without authorization. Artifacts is open beta;
keep that limitation and its pricing visible during first setup.

## First useful preview

- Run `node scripts/setup-agent.mjs` when dependencies are missing or the
  lockfile changed. It uses the pinned pnpm and tries to install Chromium; if
  the browser download is blocked it warns and continues. `pnpm check` and
  `pnpm dev` work without it; browser tests need it (`docs/cloud.md#setup-help`).
  Choose Node 24 when selecting a runtime; the minimum is in `package.json`.
- Start with sample data and bundled schemas only for the initial look. Do not request warehouse
  credentials, an AI API key, a Cloudflare token, or MCP login to get started.
- Keep the default app name unless the person supplies one. Ask only for
  missing account access or a decision that changes the result.
- Resolve sign-in once before live setup: follow
  `docs/auth.md#choose-sign-in-with-your-agent`. Reuse known preferences;
  otherwise give one short recommendation and choice, collecting allowed
  viewers in the same exchange when possible. Carry it through new production
  and preview setup. Handle authorized configuration yourself; hand off only
  private entry or account steps you cannot complete. Preserve existing guards.
- For a local browser check, use `pnpm dev` with the environment's managed
  service facility and check `/healthz` and a report. A VM's localhost URL is
  not a hosted preview link. Stop services when finished unless the person
  is using the preview. If port 3000 is occupied, reuse the intended server or
  stop only your own stale process; never pick another port silently. After
  stopping a shell wrapper, verify its server process stopped too.
- With authorization, establish the app's Artifacts repository, secure Git
  authentication and remote as described in `docs/cloud.md`. Confirm the account
  and Worker targets, and keep tokens out of tool output, arguments and URLs.
  Never replace the upstream remote or force-push. If source access or billing
  needs the person, name that exact step while continuing local preparation.
- Follow the Cloudflare setup table in `docs/cloud.md`. Connect the production
  Worker first for a hosted sample URL; then connect the preview Worker and
  actual warehouse data before iteration. Each targets its own
  Worker. The person signs into accounts and accepts billing privately.
  If you cannot configure their dashboard, give the exact pending click and
  link; keep doing independent work. Never run a production deploy from the
  shell as a substitute for a missing preview. Finish preview setup before
  proposing publication of a live-data change.
- For the unchanged starter, return the initial sample app URL from the
  Cloudflare connection. Do not manufacture an empty commit or PR. The first actual edit
  starts the branch-preview loop below.

## Change, preview, publish

1. Work on a task branch. Preserve platform-assigned branch names (especially
   Claude's). Keep `main` for approved releases. Reuse the current task branch
   for feedback on the same preview.
2. Make the requested change using existing patterns. Run `pnpm check` and
   `pnpm test:e2e` after UI changes. Report live-data validation separately;
   sample fixtures do not establish warehouse correctness.
3. With authorization to commit and push, send only the requested changes to
   the task branch on the connected remote. Artifacts uses ordinary Git;
   do not create a PR or route through GitHub for that path. For a browser
   agent using GitHub, use its existing repository tools and authorized PR
   workflow; do not request a PAT just because shell authentication is absent.
4. Cloudflare runs `deploy:preview`, including the full `check:deploy` gate,
   against the separate preview Worker. Wait for the current commit's successful
   build and get the actual URL from `<app>-preview` → Previews (or a linked PR).
   Share its build link while pending. Return the actual preview URL as soon as deployed with verification pending, then continue verification. Never substitute localhost or a guessed URL.
   On first setup, verify the source connection, build/deploy/Preview commands
   and successful push-triggered build before claiming auto-deploy is ready.
   Do not infer this from GitHub status or a local check.
   Follow `docs/cloud.md#verify-a-hosted-build` from the matching checkout.
   Always verify build, guard and Connection; use the documented `--grep` option
   for report-only changes, and the full suite for first connection or shared
   changes. Confirm the intended store and changed behavior. If authenticated
   browser access is unavailable, ask the person to finish that specific check
   privately; never request passwords in chat or weaken the guard.
   Report the link, commit, data mode, checks and whether browser verification ran.
   Never invent a URL or return an older preview as the current change. A sample
   report after onboarding or a 503 is a setup failure. Without a preview Worker,
   finish its connection before proposing publication.
5. Publishing needs explicit approval for the reviewed change. Fetch the remote
   state and confirm the task commit is the reviewed preview, its Cloudflare
   release gate passed, the viewer guard and Connection passed, and the changed
   page works on actual data with the intended store. Promote the reviewed
   change to `main` and push the connected remote only with that approval.
   If newer main changes require combining commits, verify the combined result
   on the task preview before promotion. Never force-push. On GitHub, an approved
   PR merge is an alternative promotion; honor existing branch protection.
   Obtain the resulting `main` commit, wait for its successful Cloudflare deploy,
   match `/healthz` to it, and repeat the same hosted verification scope against
   production. If the person must finish authenticated verification, report
   **Deployed, awaiting verification** and the exact check. A push or successful
   build alone does not establish that it works.
6. To undo publication, prepare a revert on a task branch, review it and publish
   it with approval using current runtime settings. Before an urgent Cloudflare
   version rollback, follow `docs/operations.md#rolling-back`: it can restore
   old passwords and store restrictions. Revert the source too.

For Access, enter only `SM_CONNECTION` from the issued block and omit or remove `APP_BASIC_AUTH` in each hosted environment. Use `pnpm app:setup credentials <target>` for the exact destination. When connecting production, record live intent so the generated `APP_REQUIRE_LIVE=true` ships with its source.

Follow `docs/cloud.md#connect-your-data` and `#connect-preview-data` for private
credential placement. Reuse **Production** for the production Worker only and
**Development** for previews and optional agent debugging. No third credential
is needed. Only trusted branches may receive preview credentials. Never use
`--ignore-base-config`. Keep
`APP_REQUIRE_LIVE`, production's `preview_urls: false`, and the viewer guard on
every hostname. If issuance is unavailable, sample setup can continue, but
live iteration is not ready. Money labels come from each store's
`dim_stores.store_currency_code` with no setup
(`docs/data.md#money-and-currency`); set `app.config.ts` currency only as a
deliberate override. With
authorization, give each Worker an `APP_QUERY_CACHE` KV namespace
(`docs/cloud.md#query-cache`) so the query cache survives restarts; without it
the app still works, memory only, and the Connection page says so.

For credential rotation or tighter viewer/store access, follow
`docs/operations.md#replacing-secrets`. Base updates and branch deletion do not
retire old immutable previews; follow its approved preview-Worker reset and
verify old URLs are retired. Do not delete the production Worker.

Use hosted Connection for deployed-app diagnosis. For authorized live debugging,
follow `docs/cloud.md#debug-with-live-data`; never request the production key,
inspect secret files, or print variables. Run the diagnostics yourself. Do not
remove the viewer guard to automate sign-in. Without Development credentials,
use bundled schemas or separately authorized MCP and state the validation gap.

Keep the handoff short: preview or live link, what changed, what was verified,
and the one remaining action, if any. For code questions or read-only checks,
do not create a deployment or PR unless asked.
