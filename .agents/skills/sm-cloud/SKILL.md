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
   With privately configured viewer access, run
   `pnpm test:hosted <https-origin> <full-git-commit>` from the matching checkout.
   It checks build, guard, Connection and the existing live report suite without
   a warehouse key or local server. Confirm the intended store and changed query
   too. For Access, follow `docs/cloud.md#verify-a-hosted-build`. If authenticated
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
   to that commit. Rerun hosted verification against production, then check the
   changed page. If the person must complete authenticated verification, report
   **Deployed, awaiting verification** and the exact check. Only call it done
   after verification; a merge or successful build is not proof it works.
6. To undo a publication, propose reverting its code change through a new PR.
   Cloudflare's deployment rollback is for urgent recovery; explain that it
   does not revert Git or warehouse data. Follow the person's authorization.

Use only **Production** and **Development** app credentials for this workflow.
The `preview` environment and optional live agent debugging share Development;
do not ask for a third Preview credential. Reuse the person's existing
Development block, regardless of its app label. Follow
`docs/cloud.md#connect-preview-data`: the person privately
adds its complete block and matching store restriction to the preview Worker's
**Previews Base**, once, before creating branch previews. Do not use
`--ignore-base-config`. Existing previews retain their secrets; changing Base
does not update them. Update their own settings or propose recreating those
specific previews with approval. Never remove `APP_REQUIRE_LIVE` to hide a
configuration error. Only trusted branches may receive preview credentials.
For credential rotation or tighter viewer/store access, follow
`docs/operations.md#replacing-secrets`: old immutable deployments keep their
settings even after branch deletion in our hosted rehearsal. Prepare the
preview-Worker reset, obtain approval to delete it, and verify old URLs are
retired before and after recreating it. Do not delete the production Worker.
Keep production's `preview_urls: false`. Production warehouse credentials stay in its
runtime settings, and the viewer guard must protect every hostname. An accepted
organization admin obtains the one-time block from SourceMedium's Apps page;
if provisioning is not enabled, name the blocker; initial sample setup can
continue, but live iteration is not ready.
Use the hosted Connection check and its safe report for deployed-app diagnosis.
For authorized live debugging, follow `docs/cloud.md#debug-with-live-data`: the
person privately enters the same Development block in the cloud environment's
direct variables. Replacing or revoking it affects previews and debugging;
update all its uses, not just Base. Never request the production key or use network
secret substitution for a signing key. Run `pnpm diagnose`, `pnpm schema` and
the relevant live checks yourself; never inspect secret files or print variables.
Do not publish a live localhost preview or remove its viewer guard to automate
sign-in. Automated tests keep synthetic fixtures; hosted previews use actual
data. If no Development
credential is configured, use bundled schemas or separately authorized MCP and
state what could not be verified against the warehouse.

Keep the handoff short: preview or live link, what changed, what was verified,
and the one remaining action, if any. For code questions or read-only checks,
do not create a deployment or PR unless asked.
