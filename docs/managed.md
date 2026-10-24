# Apps SourceMedium hosts

When SourceMedium hosts your app, your team still owns the code in a private
GitHub repository, but there is no Google key, hosting account or warehouse
setting to manage. Every query goes through SourceMedium's data API, which
holds the credential, runs your SQL read-only, and checks on every request
that the person or token behind it still has access.

This guide covers managed development and hosting. The data adapter and a
manually deployed staging app with workspace sign-in are verified. Self-service
repository creation, builds and the Agent setup panel are not available yet;
ask the SourceMedium operator for a developer token and the data API address.
A self-hosted app keeps using [connect.md](connect.md); the two never mix.

| Mode                    | Set by                               | Data                                                     |
| ----------------------- | ------------------------------------ | -------------------------------------------------------- |
| Self-hosted (or sample) | You, as in [connect.md](connect.md)  | Your Google key, or sample data                          |
| Managed development     | `SM_HOSTING=managed-dev`             | SourceMedium's data API, with your developer token       |
| Managed hosting         | SourceMedium, on its hosted app only | SourceMedium's data API, for signed-in workspace members |

Managed development never falls back to sample data. A missing setting, a
refused token or an unreachable API is an error that says what to fix. It
also refuses every self-hosted setting (`SM_CONNECTION`, the seven separate
data settings, `APP_BASIC_AUTH`, Cloudflare Access, `APP_STORE_ID`,
`BIGQUERY_MAX_BYTES_BILLED`) rather than guessing which one you meant.
`pnpm schema` also refuses invalid managed settings instead of printing its
offline schema snapshot.

Hosted mode is set by SourceMedium's deploy. `pnpm dev`, `pnpm diagnose` and
`pnpm schema` refuse it; use `managed-dev` on your computer.

The member staging pilot uses individual workspace sign-in and
`SM_GATEWAY_AUTH=workspace`. The earlier M0 probe remains separate: it uses
shared probe access with a fixed test viewer and `SM_GATEWAY_AUTH=probe`.
Both set `APP_ENVIRONMENT=staging`; the app labels its access mode accordingly.
These labels never authorize a request: the gateway viewer and the data API's
app, deployment and membership checks still apply.

## What your app can read

Every store in your organization, from SourceMedium's published and
documented datasets: the report (`transformed`) and metadata datasets, plus
any dataset your data dictionary documents. Your own datasets in a dedicated
project are not included. `pnpm diagnose` and `pnpm schema <relation>` show
what is reachable.

The data API only reads. A query runs for at most 30 seconds, scans at most
10 GiB, and returns up to 1,000 rows by default and 10,000 at most
(`maxRows`); more rows than that fail unless the query passes
`partial: true`. Values are bound as named parameters, never pasted into SQL.

## Local development

1. Ask the SourceMedium operator to issue a developer token for "Local"
   through the app management API. It is shown once. The planned **Agent
   setup** panel will replace this operator step.
2. Put these in `.env.local` (git-ignored), removing any self-hosted values:

   ```sh
   SM_HOSTING=managed-dev
   SM_DATA_API_URL=https://<your SourceMedium address>/api/app-data/v1
   SM_DEVELOPER_TOKEN=smapp_…
   ```

   Use the exact `SM_DATA_API_URL` supplied by the operator.

3. Run `pnpm diagnose`, then `pnpm dev`, and open http://127.0.0.1:3000.

The development server answers only this computer. `pnpm dev` listens on
127.0.0.1, and managed development refuses to start Next on any other
address. A request whose Host or Origin is not `127.0.0.1`, `localhost` or
`[::1]` also gets a 403. Do not expose the dev server through a tunnel or
port forward: the token authorizes your development session, not a public
app, and a tunnel that rewrites the Host header would pass that check.

## Cloud agents

> Fresh Codex cloud and Claude Code on the web environments are unverified.
> Treat these instructions as a proposed configuration, not a supported journey.

Both environments get the same two plain variables, `SM_HOSTING=managed-dev`
and `SM_DATA_API_URL`, and allow network access to your SourceMedium host.

- **Codex cloud** (new Cloud environments only; Legacy environments give
  secrets to setup scripts alone): add the token as a network secret named
  `SM_DEVELOPER_TOKEN` for your SourceMedium host.
- **Claude Code on the web**: add a network secret that sends
  `Authorization: Bearer <token>` to your SourceMedium host. Do not set
  `SM_DEVELOPER_TOKEN`; the proxy adds the header, so the agent never sees the
  token.

The app sends `Authorization: Bearer $SM_DEVELOPER_TOKEN` when that variable
is set and nothing otherwise, which covers a real value, a placeholder the
Codex proxy swaps, and a header the Claude proxy adds.

Cloud environments send HTTPS through a proxy named in `HTTPS_PROXY`, and
Node's `fetch` ignores it by default. In managed development, `pnpm dev`,
`pnpm diagnose` and `pnpm schema` start Node with `NODE_USE_ENV_PROXY=1` when a
proxy is set, and keep loopback off the proxy
(`scripts/managed-node.mjs`). The verified Node versions (22.22.1, 24.7 and 26)
honor that setting; older releases such as 22.16 silently ignore it. See
[Node's proxy support](https://nodejs.org/learn/http/enterprise-network-configuration).
TLS verification is never turned off: if the environment uses its own
certificate authority, it must be in `NODE_EXTRA_CA_CERTS`.

Network secrets are attached during agent sessions, not setup scripts. Keep
the setup script to `pnpm install --frozen-lockfile`; the first task below is
what checks live data.

## The first task

Ask your agent to change one report query, run it against your data, and show
the rendered result before committing or pushing. Finding tables through the
SourceMedium MCP connector helps write the query, but only the app's own query
through its own adapter proves the change works. SourceMedium records a
successful token query; the planned setup UI will use that receipt for
"Agent connected".

`pnpm test:live` (or `pnpm test:live --grep Overview` for one view) builds the
app and opens every view in a browser against your data, failing on any error
state. In managed development it needs no `APP_BASIC_AUTH`: the server listens
only on 127.0.0.1, behind the same local-only check as `pnpm dev`.
`pnpm test:hosted` is for self-hosted deployments behind Basic Auth and refuses
managed mode.

Checking a changed metric against an independent number (`pnpm reconcile`,
[reconciliation.md](reconciliation.md)) is worth doing when a change alters
what a total means, with a reviewed reference for the same dates, stores,
filters, time zone and currency. It is a separate check from "the app works",
and the first task does not depend on it.

## Token expired

A token lasts 30 days. Expired, revoked and mistyped tokens all read as
"SourceMedium did not accept the developer token". Ask the SourceMedium
operator for a new token, replace `SM_DEVELOPER_TOKEN` (or the cloud environment's
network secret), and run `pnpm diagnose`. A token also stops working when the
person who created it is no longer a workspace admin or editor, or when the
app is paused or removed; ask a workspace admin.

## Troubleshooting

- `pnpm diagnose` checks the token, the store roster, the published schema,
  the data dictionary and the metric catalog, all through the data API.
- `pnpm schema <relation>` prints a relation's columns from the dataset's
  `INFORMATION_SCHEMA`, and its descriptions from the data dictionary.
- A missing table reads as "Table or dataset not found" with no job, so views
  that fall back to another table keep working.
- Failures with a SourceMedium request ID show a **Support code**. Include it
  with the failing page and time when contacting support; it connects the
  app's error or safe Connection report to SourceMedium's request log. CSV
  and dictionary errors include the same ID as `request_id`. A transport
  failure without a server response has no support code.
- Report headers say when warehouse freshness or reporting currency is
  unknown. A successful query or connection check does not establish either.
