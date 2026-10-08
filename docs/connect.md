# Connect and deploy

Using Codex Cloud or Claude Code in the cloud? Start with
[the browser guide](cloud.md). For an already hosted app, jump to
[Connect a hosted app](#connect-a-hosted-app); local setup is optional. For
agent-run warehouse debugging, use a separate [Development credential](cloud.md#debug-with-live-data).

This is a preview. Live setup requires app provisioning to be enabled in your
SourceMedium workspace. If Apps says it is not enabled, start with sample
data and contact SourceMedium support.
Start with the shared password and Cloudflare Workers Paid. Use the issued
app credential; never substitute an admin credential.

The app has three states, always shown in the top bar:

| State                   | When                                                     | What you see                                     |
| ----------------------- | -------------------------------------------------------- | ------------------------------------------------ |
| **Sample data**         | No live values are set                                   | Synthetic stores and numbers, labeled as such    |
| **Live data**           | All seven live values and one viewer guard are set       | Your warehouse, behind a password or Access      |
| **Configuration error** | Some values are missing or malformed, or no viewer guard | A list of what to fix (HTTP 503); no data at all |

There is no partial mode and no fallback: a broken live configuration never
quietly shows sample numbers.

## 1. Run it locally on sample data

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://127.0.0.1:3000. No account, credential, or network access to
SourceMedium is needed.

## 2. Get your configuration

An accepted organization **admin** opens **Apps** in their SourceMedium
workspace, names the app, and confirms its read access. No Google account
or Google Cloud console setup is needed.
The page states what the app will be able to read, then shows one
configuration block **once**:

```text
SM_APPLICATION_ID=…
SM_APP_KEY=…
BIGQUERY_JOB_PROJECT_ID=…
BIGQUERY_LOCATION=…
SM_DATA_PROJECT_ID=…
SM_TRANSFORMED_DATASET_ID=…
SM_METADATA_DATASET_ID=…
APP_BASIC_AUTH=…
```

`SM_APP_KEY` (the app's data credential) and `APP_BASIC_AUTH` (the shared
viewer password) are secrets. Treat the block like a password: keep it out of
chat, email, tickets, and git.

The credential can read everything the app's grants allow. Every viewer of a
deployment sees the same data. For separate store audiences, set `APP_STORE_ID`
before sharing each deployment; see [one deployment per store](auth.md#one-deployment-per-store).

## 3. Go live locally

Store names and brand groups load automatically from `dim_stores`. No store
list needs to be configured. Optional `storeLabels` in `app.config.ts` overrides
individual names. See [store scope](data.md#store-scope) for warehouses awaiting
the metadata table and stable links to each store.

Set `currency` in `app.config.ts` to your SourceMedium workspace's reporting
currency, for example `"USD"`. All views use this one setting for money
formatting and show the currency code in the report footer. Confirm that the
order and advertising sources included in the app already report in that
currency; setting the code does not convert values. Amazon Ads uses the store
currency, which can differ from the workspace reporting currency. Resolve any
mismatch in SourceMedium or a warehouse view before combining amounts or using
MER. `dim_stores.store_currency_code` alone does not verify reporting currency.
See [money and currency](data.md#money-and-currency).

Paste the block into `.env.local` at the repository root (git ignores it), then:

```sh
pnpm diagnose   # checks the key, datasets, locations, and a bounded example query
pnpm dev
```

Your browser asks for the username and password from `APP_BASIC_AUTH`
(`username:password`), even on localhost. The top bar shows **Live data**.

## 4. Deploy to Cloudflare

Deploy from the repository you have been editing, so your branding, currency,
and new views are included. The [cloud workflow](cloud.md#3-connect-cloudflare-once)
uses Git integration. The steps below are the alternative for local agents.

1. Use a Cloudflare account on **Workers Paid**. Have your agent set `name` in
   `wrangler.jsonc` to a unique Worker name for this app; keep that name for
   subsequent deploys.
2. In your repository's terminal, sign in and deploy:

   ```sh
   pnpm exec wrangler login
   pnpm run deploy
   ```

   The first deployment of a new Worker serves sample data. `.env.local` is
   not uploaded; your hosted app needs its own runtime settings.

3. Follow [Connect a hosted app](#connect-a-hosted-app) below to use live data.

For later code changes, run `pnpm run deploy` from this same checkout. Runtime
variables and secrets are retained, including `APP_STORE_ID`; `keep_vars: true`
in `wrangler.jsonc` preserves variables set through the dashboard. Delete a
runtime setting from the Worker explicitly when you intend to remove it.

For automatic deployments, use [the shared Git workflow](cloud.md#3-connect-cloudflare-once).
Runtime secrets belong to the Worker, not the build environment.

Use `pnpm run deploy`, not `pnpm deploy` (a pnpm built-in). The shared password
protects the `workers.dev` URL; production Version URLs are off. Branch
Previews use separate sample configuration. With Cloudflare Access,
follow [auth.md](auth.md#cloudflare-access) to protect every hostname.

### Connect a hosted app

These steps work whether Codex, Claude, or a local agent prepared the app.
You need an already issued [app-specific block](#2-get-your-configuration).

1. Confirm the workspace reporting currency and [source alignment](data.md#money-and-currency).
   Have your agent set `currency` in
   `app.config.ts`, preview the change, and publish it with your approval.
   Store names come from `dim_stores`; no store roster setup is needed.
2. Open the production Worker, **not** the `<app>-preview` Worker. In
   **Settings > Variables and Secrets**, select **Production** if an environment
   selector is shown.
   For a single-store app, add `APP_STORE_ID` using its exact `sm_store_id`;
   omit it to keep the multi-store picker. Add all eight issued values as
   **Secrets**, including `APP_BASIC_AUTH`, then save and deploy the settings.
   Enter the values privately yourself. Do not put them in agent chat, the
   agent's environment, build variables, or Preview Base settings. A separate
   Development app credential may be used in [cloud agent settings](cloud.md#debug-with-live-data).
3. Open the production URL and sign in. Click **Live data** in the top bar,
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

### Starting with a new hosted copy

The [Deploy to Cloudflare button](https://deploy.workers.cloudflare.com/?url=https://github.com/source-medium/sm-app-template)
is an alternative that creates a fresh repository in your GitHub or GitLab account. It asks for
the eight values in `.env.example` as encrypted secrets. Clone the repository
it creates to make your changes, including setting the reporting currency,
then deploy from that checkout. The fresh-account button walkthrough remains
unverified; command-line deployment is the tested path.

## 5. Vercel (unverified)

No Vercel deployment has been tested, and this preview does not claim Vercel
support. To evaluate it yourself: import the repository (framework: Next.js),
add the same eight values
as environment variables for Production (mark the two secrets as sensitive),
and deploy. Use the shared password on Vercel; Cloudflare Access is
Cloudflare-only. Vercel's own deployment protection is optional and separate.

## Test the Worker locally

`pnpm preview` builds the Worker and serves it in workerd. It reads runtime
values from `.dev.vars` (also git-ignored), not `.env.local`, exactly as the
deployed Worker reads only its runtime variables.

## Lost a secret?

Treat the configuration block as shown once. An organization admin can return
to **Apps** to recover access without sending anyone the old key or password:

- **Replace key** returns a new `SM_APP_KEY`. The old key stops
  working; update every host and `.env.local`.
- **Replace viewer password** returns a new `APP_BASIC_AUTH`. It takes effect when you
  update your hosts.
- The non-secret values can be copied again at any time.

**Revoke access** disables the app's warehouse identity and removes its keys
and grants. It does not delete your hosted code or change its viewer password.
Removing a person from SourceMedium does not revoke keys or app passwords
they already hold; replace those separately or remove their Cloudflare Access
access. See `docs/operations.md` for what each replacement interrupts.
