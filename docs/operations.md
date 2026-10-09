# Operating the app

App credentials are managed in your SourceMedium workspace's **Apps** page,
separately from this template. If that page says credentials are still being
enabled, keep sample data and ask SourceMedium support.

## Replacing secrets

| Action (Apps page)             | What changes                               | What it interrupts                                                                 |
| ------------------------------ | ------------------------------------------ | ---------------------------------------------------------------------------------- |
| **Replace key**                | A new `SM_APP_KEY`; the old key is deleted | Every deployment stops reading data until you update its `SM_APP_KEY` and redeploy |
| **Replace viewer password**    | A new `APP_BASIC_AUTH`                     | Nothing until you update your hosts; then viewers need the new password            |
| **Copy settings (no secrets)** | The app's recorded non-secret values       | Nothing; update the values and redeploy                                            |

There is no overlap window in this version: plan a key replacement for a quiet
moment and update every host right away. Google may honor access tokens issued
before the replacement for a short while.

Share the key only with people who maintain the app. When one of them leaves,
issue a replacement key.

For the **Development** app, update **Previews Base** and any coding-agent
environment using its key or password. Start a new agent task/session after
updating its settings. Revoking Development affects both preview queries and
agent debugging, while Production keeps its own credential.

Base changes apply only to newly created previews; rebuilding an existing
branch does not refresh its secrets. Updating a preview's own secrets changes
its branch URL, but earlier immutable deployment URLs keep their old secrets.
Our hosted rehearsal also found that deleting a branch preview left an old
immutable URL accessible. Do not treat branch deletion as access revocation.

When replacing Development credentials or tightening viewer/store access, have
the agent prepare a reset of the **preview Worker only**. Keep the replacement
block privately before approving deletion. Delete that Worker, verify its old
branch and immutable URLs no longer serve the app, then recreate it, reconnect
its Builds settings, and enter the current block and store restriction in Base.
Recreate active previews and verify the new settings and retired URLs again.
Cloudflare can report deletion before old URLs stop responding. Wait for both
URL forms to stop serving the app; a successful API response is not proof of
revocation. If they remain reachable, keep the incident open with Cloudflare.
This retires every preview; Production is a different Worker and stays running.
Use [Cloudflare setup](cloud.md#3-connect-cloudflare-once) and
[preview setup](cloud.md#connect-preview-data) to reconnect. Never disable
`APP_REQUIRE_LIVE` as a recovery step.

## Paused or revoked apps

When SourceMedium pauses your organization or revokes the app, its data
credential stops working; pages show **The app key was rejected**. A paused app
resumes on its own when the organization does. A revoked app never resumes;
create a new app and deploy its block.

## Query allowance

SourceMedium runs and pays for the app's queries, within daily allowances per
app and for all apps together. When an allowance is used up, pages show
**Query allowance used up** until it resets. Rotating the key does not reset
it. Contact SourceMedium if your normal use does not fit.

Each query also has a byte ceiling (default 1 GiB). A query over it fails with
**Query too large** before it runs.

## When something is wrong

In the hosted app, click **Live data → Check connection**. Use **Copy safe
report** to share the failing step with your agent or SourceMedium support.
For local or authorized cloud development, the agent runs `pnpm diagnose` with
the configured Development credential; it need not read or print the values.
Follow [live debugging](cloud.md#debug-with-live-data) to configure either cloud
agent. Hosted onboarding does not require a local file.

| Message                                  | Meaning                                             | Remedy                                                            |
| ---------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------------- |
| Configuration needs attention (503)      | Missing or malformed values, or no viewer guard     | Fix the named variables; see `docs/connect.md`                    |
| The app key was rejected                 | Google refused `SM_APP_KEY`                         | Replace the key in Apps; an issued key cannot be retrieved        |
| The app cannot read this data            | A permission is missing                             | Retry provisioning from Apps; contact SourceMedium if it persists |
| Table or dataset not found               | Wrong coordinates or location                       | Recopy the configuration from Apps; check `BIGQUERY_LOCATION`     |
| Query allowance used up                  | A daily allowance was reached                       | Wait for the reset or contact SourceMedium; do not rotate the key |
| Query too large                          | The scan would exceed the byte ceiling              | Narrow the date range or columns                                  |
| The data no longer matches this view     | A column changed type or disappeared                | `pnpm schema <relation>`, then update the view's row schema       |
| The query may not have started           | The connection dropped before BigQuery confirmed it | Reload once; the app never resubmits automatically                |
| The warehouse is temporarily unavailable | A temporary error or a short-term rate limit        | Reload in a minute                                                |

A deployment never falls back to sample data when live data fails.

## Logs

The server writes one JSON line per event with a fixed set of keys
(`src/lib/data/log.ts`): `bq_query` for every query (app id, query name, job
id, duration, bytes billed, rows, truncation, error kind), `viewer_denied`, and
`config_error`. They never contain SQL, rows, keys, passwords, or headers.
Search them in Workers Logs (Cloudflare) or Runtime Logs (Vercel), for example
by `"event":"bq_query"` and `"error_kind"`. To forward them to an error
tracker, replace `emit` in `log.ts`.

`/healthz` answers with the build id. It shows the Worker is up, not that the
warehouse is reachable; Connection or `pnpm diagnose` checks that.

## Rolling back

Prefer reverting the code through a new PR and deploying with the **current
runtime settings**, especially after replacing a password or tightening store
access. Review any reverted `wrangler.jsonc` settings before publishing.

A [Cloudflare version rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
restores that version's code, variables, and secret bindings. It can restore an
old `APP_BASIC_AUTH` or `APP_STORE_ID`, letting a former viewer back in or
widening store access. Use it for urgent recovery only after confirming the
target version's settings still meet the current access requirements. Also
revert the Git change so the next build does not restore the broken code.

After either recovery, verify the current sign-in works, replaced passwords
are rejected, and a restricted deployment denies another `?store=` with 403.
Run **Live data → Check connection**. A rollback cannot undo key deletion or
access revocation in SourceMedium/Google; restoring an old `SM_APP_KEY` can
instead break warehouse reads.
