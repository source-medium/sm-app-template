---
name: sm-cloud
description: Set up this app in Codex Cloud or Claude Code in the cloud, prepare a hosted preview, or publish an approved change through the connected Git repository.
---

# Cloud setup and iteration

Read `AGENTS.md` and `docs/cloud.md`. Both agents use the same source, setup
command, and Cloudflare Git integration. Use the person's existing repository
and environment; never create another template copy during iteration.

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
- For a local browser check, use `pnpm dev` with the environment's managed
  service facility and check `/healthz` and a report. A VM's localhost URL is
  not a hosted preview link. Stop services when finished unless the person
  is using the preview. If port 3000 is occupied, reuse the intended server or
  stop only your own stale process; never pick another port silently. After
  stopping a shell wrapper, verify its server process stopped too.
- Follow the Cloudflare setup table in `docs/cloud.md`. Connect the production
  Worker first for a hosted sample URL; then connect the preview Worker and
  actual warehouse data before iteration. Each targets its own
  Worker. The person signs into accounts and accepts billing privately.
  If you cannot configure their dashboard, give the exact pending click and
  link; keep doing independent work. Never run a production deploy from the
  shell as a substitute for a missing preview. Finish preview setup before
  proposing publication of a live-data change.
- For the unchanged starter, return the initial sample app URL from the
  Cloudflare import. Do not manufacture an empty PR. The first actual edit
  starts the branch-preview loop below.

## Change, preview, publish

1. Work on a task branch. Preserve platform-assigned branch names (especially
   Claude's). Keep `main` for approved releases. Reuse the current task branch
   for feedback on the same preview.
2. Make the requested change using existing patterns. Run `pnpm check` and
   `pnpm test:e2e` after UI changes. Report live-data validation separately;
   sample fixtures do not establish warehouse correctness.
3. With the person's authorization to commit, push, and open a PR (included
   in the starter prompt), push only the requested changes to the task branch.
   Use the platform's GitHub tools or Create PR control; do not ask for a PAT
   just because the shell lacks GitHub authentication. Do not merge yet.
4. Cloudflare Builds runs `deploy:preview` against the preview Worker. Wait for the
   current commit's successful build; get its actual Preview URL from the PR or
   `<app>-preview` Worker dashboard. Open it when network access permits.
   Follow `docs/cloud.md#verify-a-hosted-build` from the matching checkout.
   Always verify build, guard and Connection; use the documented `--grep` option
   for report-only changes, and the full suite for first connection or shared
   changes. Confirm the intended store and changed behavior too. If authenticated
   browser access is unavailable, ask the person to finish that specific check
   privately; never request the password in chat or weaken the guard.
   Report the link, commit, data mode, checks, and whether browser verification ran. Never
   invent a URL or return an older preview as if it included the current
   change. A sample report after onboarding or a 503 is a setup failure, not a
   successful preview. Without a preview Worker, finish its connection first.
5. Publishing needs explicit approval for the reviewed change. Check the
   PR's latest commit is the reviewed preview, CI passed, the viewer guard and
   hosted Connection check passed, and the changed page works on actual data
   with the intended store. If new commits arrived, review and verify them
   before promotion. Give the GitHub merge link when the platform cannot merge.
   After merge, obtain the resulting `main` commit (squash/merge can change the
   hash), wait for its successful Cloudflare deployment, and match `/healthz`
   to that commit. Repeat the same verification scope against production.
   If the person must complete authenticated verification, report
   **Deployed, awaiting verification** and the exact check. Only call it done
   after verification; a merge or successful build is not proof it works.
6. To undo a publication, propose reverting its code change through a new PR.
   Deploy with current runtime settings. Before an urgent Cloudflare version
   rollback, follow `docs/operations.md#rolling-back`: it can restore old
   passwords and store restrictions. Follow the person's authorization.

Follow `docs/cloud.md#connect-your-data` and `#connect-preview-data` for private
credential placement. Reuse **Production** for the production Worker only and
**Development** for previews and optional agent debugging. No third credential
is needed. Only trusted branches may receive preview credentials. Never use
`--ignore-base-config`. Keep
`APP_REQUIRE_LIVE`, production's `preview_urls: false`, and the viewer guard on
every hostname. If issuance is unavailable, sample setup can continue, but
live iteration is not ready. When connecting data, set `currency` in
`app.config.ts` as `docs/connect.md#connect-a-hosted-app` describes.

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
