# Connect and deploy

This is a preview. SourceMedium's Apps page and its self-service credential
flows are planned. The steps below describe that planned flow; live setup is
currently possible only with an already provisioned app-specific block.
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

When the Apps page is available, an organization **admin** opens **Apps** in
SourceMedium and creates an app.
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
and new views are included. The README button creates a new copy of the upstream
starter; it does not deploy changes from your checkout.

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

3. In the Cloudflare dashboard, open that Worker and **Settings > Variables
   and Secrets**. For a single-store app, add `APP_STORE_ID` first, using its
   exact `sm_store_id`; omit it to keep the multi-store picker. Add each of the
   eight values from your issued block as a **Secret**, then save and deploy
   the settings. Enter values privately yourself; do not paste the block into
   your agent's chat.
4. Open the Worker URL, sign in, and confirm **Live data** and the intended
   store. For a restricted app, changing `?store=` to another store must give
   HTTP 403. Then share the URL with its authorized viewers.

For later code changes, run `pnpm run deploy` from this same checkout. Runtime
variables and secrets are retained, including `APP_STORE_ID`; `keep_vars: true`
in `wrangler.jsonc` preserves variables set through the dashboard. Delete a
runtime setting from the Worker explicitly when you intend to remove it.

For automatic deployments, commit and push your changes and connect **your
repository** using [Cloudflare's Git integration](https://developers.cloudflare.com/workers/ci-cd/builds/git-integration/github-integration/).
Use `pnpm build:cloudflare` as the build command and
`pnpm exec opennextjs-cloudflare deploy` as the deploy command. Runtime secrets
belong to the Worker, not the build environment.

Use `pnpm run deploy`, not `pnpm deploy` (a pnpm built-in). The shared password
protects the `workers.dev` URL; preview URLs are off. With Cloudflare Access,
follow [auth.md](auth.md#cloudflare-access) to protect every hostname.

### Starting with a new hosted copy

If you have not customized a copy yet, the README's **Deploy to Cloudflare**
button creates a fresh repository in your GitHub or GitLab account. It asks for
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

Treat the configuration block as shown once. If it is lost before self-service
replacement is available, contact your SourceMedium admin through your existing
support channel; do not send them the old key or password.
The planned Apps page will provide:

- **Issue replacement key** returns a new `SM_APP_KEY`. The old key stops
  working; update every host and `.env.local`.
- **Replace password** returns a new `APP_BASIC_AUTH`. It takes effect when you
  update your hosts.
- The non-secret values can be copied again at any time.

See `docs/operations.md` for what each replacement interrupts.
