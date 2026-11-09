# Apps SourceMedium hosts

When SourceMedium hosts your app, it deploys the standard reporting template
for your workspace. There is no prerequisite GitHub repository, Google key,
hosting account or warehouse setting to manage. Every query goes through SourceMedium's data API, which
holds the credential, runs your SQL read-only, and checks on every request
that the person or token behind it still has access.

SourceMedium-hosted apps open at `<workspace>-app.sourcemedium.app`, such as
`democo-app.sourcemedium.app`. Dashboards in the same workspace use
`<workspace>-dashboards.sourcemedium.app`. Your workspace address stays the
same when you rename or replace an app. Links to running apps continue to work. The same
domain hosts workspace Metabase dashboards, with each app on its own origin.

This guide covers managed development and hosting. In a workspace with app
hosting enabled, **Create app** starts deployment of a reviewed template release.
SourceMedium checks the app and its warehouse connection before offering
**Open app**. Setup can be retried without creating a second app. Admins and
editors can pause, resume or remove it; workspace members open it with their
own sign-in. For custom development, an admin or editor runs `pnpm signin`
([Local development](#local-development)).
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

Hosted apps use individual workspace sign-in and `SM_GATEWAY_AUTH=workspace`.
SourceMedium sets `APP_ENVIRONMENT` for the deployment's environment. These
labels never authorize a request: the gateway viewer and the data API's app,
deployment and membership checks still apply.

## Change a hosted app

An admin or editor can connect the hosted app to a GitHub repository and
change its code. SourceMedium keeps hosting it at the same address, with the
same sign-in and data.

1. In SourceMedium, open the app's settings and choose **Make changes**. Create
   the repository from this template when it offers to; GitHub makes a private
   copy in your account or organization.
2. Enter the repository as `owner/name` and choose **Connect**. SourceMedium
   shows a connect code once.
3. In the repository's **Actions** tab, run the **SourceMedium preview**
   workflow with that code (or `gh workflow run sourcemedium.yml -f
connect_code=<code>`). This one run proves the repository is yours; the code
   expires after 72 hours and works once.
4. From then on, every push runs the workflow
   (`.github/workflows/sourcemedium.yml`). It sends the commit to SourceMedium,
   which installs, builds and checks it, then prints the preview address, or
   the build log if the build failed.
5. Admins and editors open the preview signed in to SourceMedium and publish
   it; **Restore** brings back an earlier version.

Every push gets its own preview, and nothing goes live until it is published.
A newer push to a branch replaces that branch's build if it is still waiting.
The workflow stores no secret: GitHub signs a short-lived identity token for
the repository and commit, and SourceMedium accepts only the repository the
connect code proved. Naming a repository in SourceMedium alone connects
nothing. A renamed repository keeps working; one moved to another owner
must be connected again. Each app builds at most 40 times a day.

SourceMedium builds with `pnpm install --frozen-lockfile` and
`pnpm build:cloudflare` on the Node and pnpm versions this template pins, with
only the npm registry reachable. Keep `pnpm-lock.yaml` committed, and keep
`scripts/lib/build-id.ts` and `compatibility_flags` in `wrangler.jsonc` as the
template has them; a build that changes them is refused with the reason. To
work against real data on your computer, use a developer token
([Local development](#local-development)).

Every hosted app shares the `sourcemedium.app` domain with other workspaces'
apps, so SourceMedium adds rules of its own in the browser:

- Pages call only their own address. A `fetch`, beacon or websocket to any
  other site is blocked (`connect-src 'self'`), so client-side analytics or
  third-party APIs called from the page don't work. Images, scripts, styles
  and links to other sites work as usual.
- Forms and other writes reach the app only from its own pages.
- No other site can show the app in a frame, and the app can't install a
  service worker.

A blocked request shows in the browser console of the preview.

## Update from the template

`pnpm template:update` brings the template's newer changes into your copy
and keeps yours. Commit or stash your own work first, then run it:

```sh
pnpm template:update
```

It fetches the template's `main` from GitHub, finds the template version your
copy last matched, and applies only what the template changed since then.
Files you never changed take the template's new version, your changes stay,
and a file you renamed still gets the template's changes. It never pushes or
changes your git settings.

- **No conflicts:** it makes one commit, `chore: update from the template (…)`,
  and lists the files it changed. Run `pnpm install` if `package.json` or
  `pnpm-lock.yaml` changed, then `pnpm check`.
- **Conflicts:** where you and the template changed the same lines, or you
  deleted a file the template changed, it commits nothing and lists the files.
  Edit each one to keep what you want and remove the `<<<<<<<`, `=======` and
  `>>>>>>>` markers (or `git rm` a file you want gone), `git add` it, then run
  the `git commit` command it prints. For `pnpm-lock.yaml`, take the
  template's copy with `git checkout --theirs pnpm-lock.yaml`, settle
  `package.json`, then run `pnpm install`. `git reset --hard` cancels the
  update instead.

Review the commit and push it. The push builds a preview; nothing goes live
until it is published.

The commit records the template version it reached in a `Template-Commit:`
line, so the next update starts from there; keep that line when you finish a
conflicted update yourself. If the command can't tell which template version
your copy started from, it says so; name that template commit with
`SM_TEMPLATE_BASE=<commit> pnpm template:update`.

A copy made before this command existed doesn't have it yet. Copy
`scripts/template-update.ts` and `scripts/lib/template-update.ts` from the
template, add its `template:update` line to your `package.json`, commit, then
run it.

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

An admin or editor of the workspace runs, in the app's folder:

```sh
pnpm signin
```

It opens SourceMedium in your browser. Sign in if asked and choose **Allow**;
if you manage more than one workspace with an app, pick the one to develop.
`pnpm signin` then saves your access in `.env.local` (git-ignored) and you
run `pnpm diagnose`, then `pnpm dev`, and open http://127.0.0.1:3000.

What it saves is a developer token that reads your app's data as you for 30
days: `SM_HOSTING=managed-dev`, `SM_DATA_API_URL` and `SM_DEVELOPER_TOKEN`.
Running `pnpm signin` again replaces this computer's token. It comments out
any self-hosted settings in `.env.local`, which managed development refuses.
To sign in to SourceMedium's staging site instead, set
`SOURCEMEDIUM_URL=https://urchin-staging.sourcemedium.com` first.

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

A cloud environment has no browser to sign in with. Run `pnpm signin` on your
own computer and copy `SM_DEVELOPER_TOKEN` from `.env.local` into the
environment's secret:

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
successful token query.

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
"SourceMedium did not accept the developer token". Run `pnpm signin` again
(and copy the new token into a cloud environment's network secret), then run
`pnpm diagnose`. A token also stops working when the
person who created it no longer has direct, workspace-wide admin or editor
access, or when the app is paused or removed or its workspace is no longer
active; ask a workspace admin.

## Troubleshooting

- `pnpm diagnose` checks the token, the store roster, the data dictionary and
  the metric catalog, all through the data API.
- `pnpm schema <relation>` prints a relation's columns from the dataset's
  `INFORMATION_SCHEMA`, and its descriptions from the data dictionary.
- A missing table reads as "Table or dataset not found" with no job, so views
  that fall back to another table keep working.
- Failures with a SourceMedium request ID show a **Support code**. Include it
  with the failing page and time when contacting support; it connects the
  app's error or safe Connection report to SourceMedium's request log. CSV
  and dictionary errors include the same ID as `request_id`. A transport
  failure without a server response has no support code.
- When SourceMedium's gateway sends `X-SM-Request-ID` (a UUID per browser
  request), query and cache logs record it as `app_request_id` and
  SourceMedium's data RPC logs record it as `parent_request_id`; otherwise the
  app generates its own `app_request_id`. Each data call keeps its own support
  code. Cached results still require a fresh data context on every request,
  and each request that joins a shared in-flight query logs its own cache hit.
- Report headers say when warehouse freshness or reporting currency is
  unknown. A successful query or connection check does not establish either.
  Reports use each store's `dim_stores.store_currency_code` automatically,
  through the same data API as other metadata. Missing or invalid codes stay
  unlabeled. Explicit `app.config.ts` overrides retain precedence.
