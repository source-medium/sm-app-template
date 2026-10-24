# Operating the app

App credentials are managed in your SourceMedium workspace's **Dashboards & Apps** page,
separately from this template. If that page says credentials are still being
enabled, keep sample data and ask SourceMedium support.

## Replacing secrets

| Action (Dashboards & Apps page)  | What changes                             | What it interrupts                                                               |
| -------------------------------- | ---------------------------------------- | -------------------------------------------------------------------------------- |
| **Replace key**                  | A new connection; the old key is deleted | Every deployment stops reading data until you update its connection and redeploy |
| **Generate new viewer password** | A new `APP_BASIC_AUTH`                   | Nothing until you update your hosts; then viewers need the new password          |
| **Copy settings (no secrets)**   | The app's recorded non-secret values     | Nothing; update the values and redeploy                                          |

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

App queries run in your existing warehouse project: your dedicated project or
SourceMedium's shared `sourcemedium-bi` project. The issued configuration selects
it automatically. Its billing, reservations and query limits apply; app queries
share that project's capacity. No new Google project is needed.

If BigQuery rejects a query for exceeding a quota, pages show **Query allowance
used up**. Ask your SourceMedium admin to check the project's limits or contact
SourceMedium support. Replacing the key does not reset usage.

Each starter query also has a byte ceiling (default 1 GiB). A query over it fails
with **Query too large** before it runs. This is a safeguard in the starter, not
a spending cap on the credential: custom code can omit it.

## When something is wrong

In the hosted app, click **Live data → Check connection**. Use **Copy safe
report** to share the failing step with your agent or SourceMedium support.
For local or authorized cloud development, the agent runs `pnpm diagnose` with
the configured Development credential; it need not read or print the values.
Follow [live debugging](cloud.md#debug-with-live-data) to configure either cloud
agent. Hosted onboarding does not require a local file.

| Message                                  | Meaning                                             | Remedy                                                                         |
| ---------------------------------------- | --------------------------------------------------- | ------------------------------------------------------------------------------ |
| Configuration needs attention (503)      | Missing or malformed values, or no viewer guard     | Fix the named variables; see `docs/connect.md`                                 |
| The app key was rejected                 | Google refused `SM_APP_KEY`                         | Replace the key in Dashboards & Apps; an issued key cannot be retrieved        |
| The app cannot read this data            | A permission is missing                             | Retry provisioning from Dashboards & Apps; contact SourceMedium if it persists |
| Table or dataset not found               | Wrong coordinates or location                       | Recopy the configuration from Dashboards & Apps; check `BIGQUERY_LOCATION`     |
| Query allowance used up                  | A BigQuery quota was reached                        | Check the project's limits with SourceMedium; do not rotate the key            |
| Query too large                          | The scan would exceed the byte ceiling              | Narrow the date range or columns                                               |
| The data no longer matches this view     | A column changed type or disappeared                | `pnpm schema <relation>`, then update the view's row schema                    |
| The query may not have started           | The connection dropped before BigQuery confirmed it | Reload once; the app never resubmits automatically                             |
| The warehouse is temporarily unavailable | A temporary error or a short-term rate limit        | Reload in a minute                                                             |
| This store's time zone is not published  | No zone in `dim_stores` and no recent orders        | Ask your SourceMedium admin to set the store's time zone                       |

A deployment never falls back to sample data when live data fails.

## Logs

The server writes one JSON line per event with a fixed set of keys
(`src/lib/data/log.ts`): `bq_query` for every query the warehouse ran (app id,
query name, job id, duration, bytes billed, BigQuery `cache_hit`, rows,
truncation, error kind, and `app_cache` set to `miss` or `bypass`), `app_cache`
when the query cache served a result (`hit`), could not store one (`skip`) or
its KV tier failed (`error`), `viewer_denied`, and `config_error`. Every line a
request produces shares its `app_request_id`. They never contain SQL, rows,
keys, passwords, headers or cache keys. Managed queries also log the data API's
`request_id`. Refused managed context
loads emit `managed_context_refused` with the request ID, status and error
kind, even though the explanation page intentionally returns HTTP 200.
Search that event as well as query errors; HTTP status alone misses it.
Search them in Cloudflare's Workers Logs, for example
by `"event":"bq_query"` and `"error_kind"`. To forward them to an error
tracker, replace `emit` in `log.ts`.

`/healthz` answers with the build id. It shows the Worker is up, not that the
warehouse is reachable; Connection or `pnpm diagnose` checks that.
Logging does not create an alert. Configure and verify the host's error
notification path before relying on unattended monitoring.

## Rolling back

Prefer reverting the code on a task branch, reviewing its preview, and pushing
the approved revert to `main` on the connected remote. Deploy with the **current
runtime settings**, especially after replacing a password or tightening store
access. A pull request is optional when using GitHub. Review any reverted
`wrangler.jsonc` settings before publishing.

A [Cloudflare version rollback](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
restores that version's code, variables, and secret bindings. It can restore an
old `APP_BASIC_AUTH` or `APP_STORE_ID`, letting a former viewer back in or
widening store access. Use it for urgent recovery only after confirming the
target version's settings still meet the current access requirements. Also
revert the Git change so the next build does not restore the broken code.

After either recovery, verify the current sign-in works, replaced passwords
are rejected, and a restricted deployment denies another `?store=` with 403.
Run **Live data → Check connection**. A rollback cannot undo key deletion or
access revocation in SourceMedium/Google; restoring an old connection or `SM_APP_KEY` can
instead break warehouse reads.
