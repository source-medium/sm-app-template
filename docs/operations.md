# Operating the app

App credentials are managed in your SourceMedium workspace's **Apps** page,
separately from this template. These controls require provisioning to be enabled
in that workspace. Otherwise keep sample mode and contact SourceMedium support.

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

Your host's rollback restores code. It does not restore a replaced key or
password, and it does not undo changes SourceMedium made to the app's access.
After rolling back, check that the deployment's variables are still current.
