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
  lockfile changed. It uses the pinned pnpm and installs Chromium. Choose
  Node 24 when selecting a runtime; the minimum is in `package.json`.
- Start with sample data and bundled schemas. Do not request warehouse
  credentials, an AI API key, a Cloudflare token, or MCP login to get started.
- Keep the default app name unless the person supplies one. Ask only for
  missing account access or a decision that changes the result.
- For a local browser check, use `pnpm dev` with the environment's managed
  service facility and check `/healthz` and a report. A VM's localhost URL is
  not a hosted preview link. Stop services when finished unless the person
  is using the preview.
- Follow the Cloudflare setup table in `docs/cloud.md`. Connect the production
  Worker first for a hosted sample URL; add the sample-preview Worker when the
  person wants to review a change before it publishes. Each targets its own
  Worker. The person signs into accounts and accepts billing privately.
  If you cannot configure their dashboard, give the exact pending click and
  link; keep doing independent work. Never run a production deploy from the
  shell as a substitute for a missing preview; without a preview Worker, ask
  for approval to merge instead.
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
4. With a preview Worker, Cloudflare Builds runs `deploy:preview`. Wait for the
   current commit's successful build; get its actual Preview URL from the PR or
   `<app>-preview` Worker dashboard. Open it when network access permits.
   Report the link, commit, checks, and whether browser verification ran. Never
   invent a URL or return an older preview as if it included the current
   change. Without a preview Worker there is no preview URL: report the PR and
   ask for approval to merge; the production URL then shows the change.
5. Publishing needs explicit approval for the reviewed change. Check the
   PR's latest commit, passing CI, and preview before merging. If new commits
   arrived, review them before promotion. Give the GitHub merge link when the
   platform cannot merge. After merge, verify the production deployment and
   return the production URL. A merge alone is not proof it deployed.
6. To undo a publication, propose reverting its code change through a new PR.
   Cloudflare's deployment rollback is for urgent recovery; explain that it
   does not revert Git or warehouse data. Follow the person's authorization.

The `preview` environment is a separate Worker with public **sample data**.
Keep the production Worker's `preview_urls: false` and never add warehouse
credentials to the sample preview Worker. Live setup follows
`docs/cloud.md#connect-your-data`: production credentials stay in Cloudflare
runtime settings, and the viewer guard must protect every hostname. An accepted
organization admin obtains the one-time block from SourceMedium's Apps page;
if provisioning is not enabled, keep sample mode and name that blocker.
Use the hosted Connection check and its safe report for deployed-app diagnosis.
For authorized live debugging, follow `docs/cloud.md#debug-with-live-data`: the
person privately enters a separate Development app block in the cloud
environment's direct variables. Never request the production key or use network
secret substitution for a signing key. Run `pnpm diagnose`, `pnpm schema` and
the relevant live checks yourself; never inspect secret files or print variables.
Do not publish a live localhost preview or remove its viewer guard to automate
sign-in. Sample tests and branch previews remain sample-only. If no Development
credential is configured, use bundled schemas or separately authorized MCP and
state what could not be verified against the warehouse.

Keep the handoff short: preview or live link, what changed, what was verified,
and the one remaining action, if any. For code questions or read-only checks,
do not create a deployment or PR unless asked.
