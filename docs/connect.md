# Connect and deploy

Using Codex Cloud or Claude Code in the cloud? Start with
[the browser guide](cloud.md). For an already hosted app, jump to
[Connect a hosted app](#connect-a-hosted-app); local setup is optional. For
agent-run warehouse debugging, reuse the previews' [Development credential](cloud.md#debug-with-live-data).

This is a preview. Live data needs an app configuration block from the **Dashboards & Apps**
page of your SourceMedium workspace. If that page says credentials are still
being enabled, stay on sample data and ask SourceMedium support.
Have your agent [help you choose sign-in](auth.md#choose-sign-in-with-your-agent)
before entering live settings. Use Cloudflare Workers Paid and the issued app
credential; never substitute an admin credential.

The app has three states, always shown in the top bar:

| State                   | When                                                     | What you see                                     |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| **Sample data**         | No live values are set                                   | Synthetic stores and numbers, labeled as such    |
| **Live data**           | A valid connection and one viewer guard are set          | Your warehouse, behind a password or Access      |
| **Configuration error** | Some values are missing or malformed, or no viewer guard | A list of what to fix (HTTP 503); no data at all |

There is no partial mode and no fallback: a broken live configuration never
quietly shows sample numbers.
Hosted previews set `APP_REQUIRE_LIVE=true`: even a completely missing live
block is an error. Set it in production runtime settings when connecting your
warehouse too, so accidentally removing the whole block cannot restore sample mode.

## 1. Run it locally on sample data

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. No account, credential, or network access to
SourceMedium is needed.

## 2. Get your configuration

No block yet? Dashboards & Apps appears in the workspace menu once your data has been
delivered, and only an organization admin can create an app. If the page says
credentials are still being enabled, stay on sample data and ask
[SourceMedium support](../SUPPORT.md).

An accepted organization **admin** opens **Dashboards & Apps** in their SourceMedium
workspace, names the app, and confirms its read access. No Google account
or Google Cloud console setup is needed.
The page states what the app will be able to read, then shows one
configuration block **once**:

```text
SM_CONNECTION=…
APP_BASIC_AUTH=…
```

`SM_CONNECTION` (the app's data connection) and `APP_BASIC_AUTH` (the shared
viewer password) are secrets. Treat the block like a password: keep it out of
chat, email, tickets, and git.

Your agent helps you choose sign-in. With a shared password, save both values;
with Cloudflare Access, save only `SM_CONNECTION` and let the agent configure
[Access](auth.md#cloudflare-access). You do not need to manage project, region,
or dataset settings separately.

The credential can read everything the app's grants allow. Every viewer of a
deployment sees the same data. For separate store audiences, set `APP_STORE_ID`
before sharing each deployment; see [one deployment per store](auth.md#one-deployment-per-store).

## 3. Go live locally

Use **Switch store** in the top bar to find a store, or **All stores** to compare them.
Names, logos, websites and brand groups load from `dim_stores`; no manual store list
is needed. Missing names fall back to the website domain, then the store ID.
Missing or broken logos use initials. You can override names with `storeLabels`
in `app.config.ts`. See [store scope](data.md#store-scope) for metadata availability
and stable links to each store.

Confirm the reporting currency and monetary source alignment, then set `currency`
in `app.config.ts`, for example `"USD"`. Use `reportingCurrencies` only when stores
need different verified codes; a null override leaves that store unlabeled.
Nominal `dim_stores.store_currency_code` does not establish reporting currency.
Reports, the footer, the agent prompt, and CSV exports use the configured code.
Unset codes leave live amounts unlabeled. Setting a code does not convert amounts.
Never add money across stores. Synthetic sample data stays in USD.
See [money and currency](data.md#money-and-currency).

Dates need no setting: each store's dates follow its SourceMedium time zone,
which each dated report's footer names. See [dates](data.md#dates).

For direct localhost testing, use the shared password in the block; Cloudflare
Access protects hosted hostnames. This local setup does not change your hosted
sign-in choice. Paste the block privately into `.env.local` at the repository
root (git ignores it), then:

```sh
pnpm diagnose   # checks the key, datasets, locations, and a bounded example query
pnpm dev
```

Your browser asks for the username and password from `APP_BASIC_AUTH`
(`username:password`), even on localhost. The top bar shows **Live data**.

## 4. Deploy to Cloudflare

Deploy from the repository you have been editing, so your branding, currency,
and new views are included. The [cloud workflow](cloud.md#3-connect-cloudflare-once)
uses Cloudflare Artifacts and Workers Builds by default: task pushes create
previews, and approved pushes to `main` check and deploy automatically.
Connect that once for normal iteration. The steps below are a manual deployment
alternative; a manual deploy alone does not configure push-to-deploy.

1. Use a Cloudflare account on **Workers Paid**. Have your agent set `name` in
   `wrangler.jsonc` to a unique Worker name for this app; keep that name for
   subsequent deploys.
2. In your repository's terminal, sign in and deploy:

   ```sh
   pnpm exec wrangler login
   pnpm run deploy
   ```

   `pnpm run deploy` runs the full release gate before uploading. Have your
   agent install the locked test browser with `pnpm exec playwright install --with-deps chromium`
   once if needed. Failed checks stop publication.

   The first deployment of a new Worker serves sample data. `.env.local` is
   not uploaded; your hosted app needs its own runtime settings.

3. Follow [Connect a hosted app](#connect-a-hosted-app) below to use live data.

For later manual deployments, run `pnpm run deploy` from this same checkout. Runtime
variables and secrets are retained, including `APP_STORE_ID`; `keep_vars: true`
in `wrangler.jsonc` preserves variables set through the dashboard. Delete a
runtime setting from the Worker explicitly when you intend to remove it.

For automatic deployments, use [the shared Git workflow](cloud.md#3-connect-cloudflare-once).
Runtime secrets belong to the Worker, not the build environment.

Use `pnpm run deploy`, not `pnpm deploy` (a pnpm built-in). The chosen viewer guard
must protect the `workers.dev` URL; production Version URLs are off. Branch
Previews use the Development credential for the same warehouse and require live
data; follow [preview setup](cloud.md#connect-preview-data). With Cloudflare Access,
follow [auth.md](auth.md#cloudflare-access) to protect every hostname.

### Connect a hosted app

These steps work whether Codex, Claude, or a local agent prepared the app.
You need an already issued [app-specific block](#2-get-your-configuration).
Your agent reuses your [sign-in choice](auth.md#choose-sign-in-with-your-agent)
and handles the steps below within its authorization and account access.
You only need to complete private entry and account steps it cannot perform.

1. Confirm the workspace reporting currency and [source alignment](data.md#money-and-currency).
   Have your agent set `currency` (and per-store `reportingCurrencies` if needed) in
   `app.config.ts` on a task branch. Prepare the change now; review and publish
   it after the runtime settings below are ready.
   Store names come from `dim_stores`; no store roster setup is needed.
2. Open the production Worker, **not** the `<app>-preview` Worker. In
   **Settings > Variables and Secrets**, select **Production** if an environment
   selector is shown.
   For a single-store app, add `APP_STORE_ID` using its exact `sm_store_id`;
   omit it to keep the multi-store picker. Add `SM_CONNECTION` as one
   **Secret**, then [configure the chosen sign-in](auth.md#configure-the-chosen-sign-in).
   Set `APP_REQUIRE_LIVE=true` as a runtime variable, then save and deploy the settings.
   Enter the values privately yourself. Do not put the block in agent chat, the
   agent's environment, build variables, or Previews Base settings. Viewer-only
   `APP_BASIC_AUTH` may be entered privately for [hosted verification](cloud.md#verify-a-hosted-build); the production warehouse key stays in the Worker. A separate
   Development app credential may be used in [cloud agent settings](cloud.md#debug-with-live-data).
3. [Connect preview data](cloud.md#connect-preview-data) with the Development
   app credential for this warehouse and the same store scope. Reuse that
   credential for optional agent debugging. Review the currency change on its
   protected live preview, check Connection and the intended store, then approve
   publication. See [hosted verification](cloud.md#verify-a-hosted-build).
4. Open the production URL and sign in. Click **Live data** in the top bar,
   then **Check connection**. Fix any failed check using its remedy. The mode
   label alone means configuration is present, not that queries succeeded.
   Confirm **Live data** on each view with no error state. Confirm the intended store. A restricted app must
   return HTTP 403 when `?store=` names another store. An anonymous browser
   must be challenged before seeing data. Share only with authorized viewers.

No local `.env` file or `pnpm diagnose` is required for this hosted path.
Your agent can inspect code and bundled schemas without the warehouse key.
When troubleshooting, use **Copy safe report** on Connection. Never share
values from the settings screen. Live rendering is a connection check, not an
independent reconciliation of the metrics.

## Test the Worker locally

`pnpm preview` builds the Worker and serves it in workerd. It reads runtime
values from `.dev.vars` (also git-ignored), not `.env.local`, exactly as the
deployed Worker reads only its runtime variables. It first prints the mode
`.dev.vars` produces and stops on a broken block, so a live `.env.local` with
no `.dev.vars` shows **Sample data** here on purpose. Paste the block into
`.dev.vars` to preview live data.

## Lost a secret?

Treat the configuration block as shown once. An organization admin can return
to **Dashboards & Apps** to recover access without sending anyone the old key or password:

- **Replace key** returns a new `SM_CONNECTION` (or `SM_APP_KEY` for older
  separate settings). The old key stops working; update every use. Viewer
  sign-in stays unchanged. Tokens already minted with the old key can keep
  working until they expire, so for a compromised key revoke access and
  create a new app.
- **Generate new viewer password** returns a new `APP_BASIC_AUTH`. It takes effect when you
  update your hosts.
- The non-secret values can be copied again at any time.

**Revoke access** disables the app's warehouse identity, removes its keys and
grants, then deletes the identity. It does not delete your hosted code or
change its viewer password.
Removing a person from SourceMedium does not revoke keys or app passwords
they already hold; replace those separately or remove their Cloudflare Access
access. See `docs/operations.md` for what each replacement interrupts.

## Existing deployments

The original seven data settings remain supported: `SM_APPLICATION_ID`,
`SM_APP_KEY`, `BIGQUERY_JOB_PROJECT_ID`, `BIGQUERY_LOCATION`,
`SM_DATA_PROJECT_ID`, `SM_TRANSFORMED_DATASET_ID`, and `SM_METADATA_DATASET_ID`.
Keep them for an existing deployment; no migration or key replacement is
needed just to update the starter. Dashboards & Apps offers **Using an older starter? →
Copy separate settings** when issuing or replacing a key.

To switch formats, first deploy a starter that supports `SM_CONNECTION`. Then
save the connection secret and remove the seven separate data settings in the
same settings update. Keep sign-in, `APP_STORE_ID`, and query limits intact.
Mixing the two data formats is a configuration error. Roll back with separate
settings for the current key; a retired key cannot restore access.

`SM_CONNECTION` is a versioned base64 JSON bundle of those same data settings,
not encryption. Keep it in the host's Secret field. The app validates its
contents locally; it adds no runtime dependency on a SourceMedium API.
